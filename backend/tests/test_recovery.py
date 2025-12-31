"""Tests for generation recovery service."""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.services.recovery import (
    Checkpoint,
    CheckpointStore,
    FailureClassifier,
    FailureType,
    GenerationRecoveryWrapper,
    RecoveryOperation,
    RecoveryService,
    RecoveryState,
    RetryConfig,
    compute_content_hash,
)

# =============================================================================
# RecoveryState Enum Tests
# =============================================================================


class TestRecoveryState:
    """Tests for RecoveryState enum."""

    def test_all_states_exist(self):
        """All recovery states should be defined."""
        assert RecoveryState.PENDING.value == "pending"
        assert RecoveryState.IN_PROGRESS.value == "in_progress"
        assert RecoveryState.CHECKPOINTED.value == "checkpointed"
        assert RecoveryState.COMPLETED.value == "completed"
        assert RecoveryState.FAILED.value == "failed"
        assert RecoveryState.RECOVERED.value == "recovered"
        assert RecoveryState.ABANDONED.value == "abandoned"

    def test_state_count(self):
        """Should have exactly 7 states."""
        assert len(RecoveryState) == 7


class TestFailureType:
    """Tests for FailureType enum."""

    def test_all_failure_types_exist(self):
        """All failure types should be defined."""
        assert FailureType.TIMEOUT.value == "timeout"
        assert FailureType.API_ERROR.value == "api_error"
        assert FailureType.RATE_LIMIT.value == "rate_limit"
        assert FailureType.VALIDATION_ERROR.value == "validation_error"
        assert FailureType.NETWORK_ERROR.value == "network_error"
        assert FailureType.OUT_OF_MEMORY.value == "out_of_memory"
        assert FailureType.UNKNOWN.value == "unknown"

    def test_failure_type_count(self):
        """Should have exactly 7 failure types."""
        assert len(FailureType) == 7


# =============================================================================
# Checkpoint Tests
# =============================================================================


class TestCheckpoint:
    """Tests for Checkpoint dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        checkpoint = Checkpoint()
        assert checkpoint.id is not None
        assert checkpoint.operation_id is not None
        assert checkpoint.sequence_number == 0
        assert checkpoint.state == {}
        assert checkpoint.partial_result == ""
        assert checkpoint.progress == 0.0
        assert checkpoint.created_at is not None
        assert checkpoint.metadata == {}

    def test_custom_values(self):
        """Should accept custom values."""
        op_id = uuid4()
        checkpoint = Checkpoint(
            operation_id=op_id,
            sequence_number=5,
            state={"key": "value"},
            partial_result="Some content",
            progress=0.75,
            metadata={"words": 100},
        )
        assert checkpoint.operation_id == op_id
        assert checkpoint.sequence_number == 5
        assert checkpoint.state == {"key": "value"}
        assert checkpoint.partial_result == "Some content"
        assert checkpoint.progress == 0.75
        assert checkpoint.metadata == {"words": 100}

    def test_to_dict(self):
        """Should serialize to dictionary."""
        checkpoint = Checkpoint(
            partial_result="Test",
            progress=0.5,
        )
        data = checkpoint.to_dict()
        assert "id" in data
        assert "operation_id" in data
        assert data["partial_result"] == "Test"
        assert data["progress"] == 0.5
        assert "created_at" in data

    def test_from_dict(self):
        """Should deserialize from dictionary."""
        original = Checkpoint(
            partial_result="Test",
            progress=0.5,
        )
        data = original.to_dict()
        restored = Checkpoint.from_dict(data)
        assert restored.id == original.id
        assert restored.partial_result == original.partial_result
        assert restored.progress == original.progress

    def test_serialization_roundtrip(self):
        """Should survive serialization roundtrip."""
        original = Checkpoint(
            sequence_number=3,
            state={"chapter": 5, "position": 1234},
            partial_result="Chapter content here...",
            progress=0.65,
            metadata={"tokens": 500},
        )
        data = original.to_dict()
        restored = Checkpoint.from_dict(data)
        assert restored.sequence_number == original.sequence_number
        assert restored.state == original.state
        assert restored.partial_result == original.partial_result
        assert restored.progress == original.progress
        assert restored.metadata == original.metadata


# =============================================================================
# RetryConfig Tests
# =============================================================================


class TestRetryConfig:
    """Tests for RetryConfig dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        config = RetryConfig()
        assert config.max_retries == 3
        assert config.initial_delay == 1.0
        assert config.max_delay == 60.0
        assert config.exponential_base == 2.0
        assert config.jitter == 0.1

    def test_get_delay_first_attempt(self):
        """First attempt should use initial delay."""
        config = RetryConfig(initial_delay=1.0, jitter=0)
        delay = config.get_delay(0)
        assert delay == 1.0

    def test_get_delay_exponential(self):
        """Delay should increase exponentially."""
        config = RetryConfig(initial_delay=1.0, exponential_base=2.0, jitter=0)
        assert config.get_delay(0) == 1.0
        assert config.get_delay(1) == 2.0
        assert config.get_delay(2) == 4.0
        assert config.get_delay(3) == 8.0

    def test_get_delay_max_cap(self):
        """Delay should be capped at max_delay."""
        config = RetryConfig(initial_delay=1.0, max_delay=10.0, jitter=0)
        delay = config.get_delay(10)  # Would be 1024 without cap
        assert delay == 10.0

    def test_get_delay_with_jitter(self):
        """Delay should include jitter."""
        config = RetryConfig(initial_delay=1.0, jitter=0.5)
        delays = [config.get_delay(0) for _ in range(10)]
        # With 50% jitter on 1.0, delays should vary between 1.0 and 1.5
        assert all(1.0 <= d <= 1.5 for d in delays)
        # Should have some variation
        assert len(set(delays)) > 1

    def test_is_retryable_default(self):
        """Default retryable failures should be set."""
        config = RetryConfig()
        assert config.is_retryable(FailureType.TIMEOUT)
        assert config.is_retryable(FailureType.API_ERROR)
        assert config.is_retryable(FailureType.RATE_LIMIT)
        assert config.is_retryable(FailureType.NETWORK_ERROR)
        assert not config.is_retryable(FailureType.VALIDATION_ERROR)
        assert not config.is_retryable(FailureType.OUT_OF_MEMORY)

    def test_is_retryable_custom(self):
        """Custom retryable failures should work."""
        config = RetryConfig(retryable_failures={FailureType.VALIDATION_ERROR})
        assert config.is_retryable(FailureType.VALIDATION_ERROR)
        assert not config.is_retryable(FailureType.TIMEOUT)


# =============================================================================
# RecoveryOperation Tests
# =============================================================================


class TestRecoveryOperation:
    """Tests for RecoveryOperation dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        op = RecoveryOperation()
        assert op.id is not None
        assert op.operation_type == ""
        assert op.state == RecoveryState.PENDING
        assert op.checkpoints == []
        assert op.retry_count == 0
        assert op.last_failure is None
        assert op.last_error_message == ""

    def test_add_checkpoint(self):
        """Should add checkpoints with proper sequencing."""
        op = RecoveryOperation()
        cp1 = Checkpoint(partial_result="Part 1")
        cp2 = Checkpoint(partial_result="Part 2")

        op.add_checkpoint(cp1)
        assert len(op.checkpoints) == 1
        assert cp1.sequence_number == 0
        assert cp1.operation_id == op.id
        assert op.state == RecoveryState.CHECKPOINTED

        op.add_checkpoint(cp2)
        assert len(op.checkpoints) == 2
        assert cp2.sequence_number == 1

    def test_get_latest_checkpoint(self):
        """Should return the most recent checkpoint."""
        op = RecoveryOperation()
        assert op.get_latest_checkpoint() is None

        cp1 = Checkpoint(partial_result="Part 1")
        cp2 = Checkpoint(partial_result="Part 2")
        op.add_checkpoint(cp1)
        op.add_checkpoint(cp2)

        latest = op.get_latest_checkpoint()
        assert latest == cp2

    def test_get_partial_result(self):
        """Should combine partial results from all checkpoints."""
        op = RecoveryOperation()
        assert op.get_partial_result() == ""

        op.add_checkpoint(Checkpoint(partial_result="Hello "))
        op.add_checkpoint(Checkpoint(partial_result="World"))

        result = op.get_partial_result()
        assert result == "Hello World"

    def test_get_total_progress(self):
        """Should return max progress from checkpoints."""
        op = RecoveryOperation()
        assert op.get_total_progress() == 0.0

        op.add_checkpoint(Checkpoint(progress=0.25))
        assert op.get_total_progress() == 0.25

        op.add_checkpoint(Checkpoint(progress=0.75))
        assert op.get_total_progress() == 0.75


# =============================================================================
# CheckpointStore Tests
# =============================================================================


class TestCheckpointStore:
    """Tests for CheckpointStore class."""

    @pytest.fixture
    def store(self):
        """Create a CheckpointStore instance."""
        return CheckpointStore()

    def test_save_and_get_operation(self, store):
        """Should save and retrieve operations."""
        op = RecoveryOperation(operation_type="chapter_generation")
        store.save_operation(op)

        retrieved = store.get_operation(op.id)
        assert retrieved == op

    def test_get_nonexistent_operation(self, store):
        """Should return None for nonexistent operation."""
        assert store.get_operation(uuid4()) is None

    def test_save_and_get_checkpoint(self, store):
        """Should save and retrieve checkpoints."""
        cp = Checkpoint(partial_result="Test")
        store.save_checkpoint(cp)

        retrieved = store.get_checkpoint(cp.id)
        assert retrieved == cp

    def test_get_nonexistent_checkpoint(self, store):
        """Should return None for nonexistent checkpoint."""
        assert store.get_checkpoint(uuid4()) is None

    def test_save_checkpoint_updates_operation(self, store):
        """Saving checkpoint should update parent operation."""
        op = RecoveryOperation()
        store.save_operation(op)

        cp = Checkpoint(operation_id=op.id, partial_result="Test")
        store.save_checkpoint(cp)

        assert cp in op.checkpoints

    def test_get_checkpoints_for_operation(self, store):
        """Should get all checkpoints for an operation."""
        op = RecoveryOperation()
        store.save_operation(op)

        cp1 = Checkpoint(operation_id=op.id, partial_result="Part 1")
        cp2 = Checkpoint(operation_id=op.id, partial_result="Part 2")
        cp3 = Checkpoint(operation_id=uuid4(), partial_result="Other")  # Different op

        store.save_checkpoint(cp1)
        store.save_checkpoint(cp2)
        store.save_checkpoint(cp3)

        checkpoints = store.get_checkpoints_for_operation(op.id)
        assert len(checkpoints) == 2
        assert cp1 in checkpoints
        assert cp2 in checkpoints
        assert cp3 not in checkpoints

    def test_delete_operation(self, store):
        """Should delete operation and its checkpoints."""
        op = RecoveryOperation()
        cp = Checkpoint(operation_id=op.id)
        op.add_checkpoint(cp)
        store.save_operation(op)

        result = store.delete_operation(op.id)
        assert result is True
        assert store.get_operation(op.id) is None
        assert store.get_checkpoint(cp.id) is None

    def test_delete_nonexistent_operation(self, store):
        """Should return False for nonexistent operation."""
        result = store.delete_operation(uuid4())
        assert result is False

    def test_get_recoverable_operations(self, store):
        """Should get operations that can be recovered."""
        op1 = RecoveryOperation(state=RecoveryState.CHECKPOINTED)
        op2 = RecoveryOperation(state=RecoveryState.FAILED)
        op3 = RecoveryOperation(state=RecoveryState.COMPLETED)
        op4 = RecoveryOperation(state=RecoveryState.PENDING)

        store.save_operation(op1)
        store.save_operation(op2)
        store.save_operation(op3)
        store.save_operation(op4)

        recoverable = store.get_recoverable_operations()
        assert len(recoverable) == 2
        assert op1 in recoverable
        assert op2 in recoverable

    def test_cleanup_old_operations(self, store):
        """Should remove operations older than max_age."""
        old_op = RecoveryOperation(started_at=datetime.utcnow() - timedelta(hours=48))
        new_op = RecoveryOperation(started_at=datetime.utcnow())

        store.save_operation(old_op)
        store.save_operation(new_op)

        removed = store.cleanup_old_operations(timedelta(hours=24))
        assert removed == 1
        assert store.get_operation(old_op.id) is None
        assert store.get_operation(new_op.id) is not None


# =============================================================================
# FailureClassifier Tests
# =============================================================================


class TestFailureClassifier:
    """Tests for FailureClassifier class."""

    @pytest.fixture
    def classifier(self):
        """Create a FailureClassifier instance."""
        return FailureClassifier()

    def test_classify_timeout(self, classifier):
        """Should classify timeout errors."""
        assert classifier.classify(TimeoutError("Connection timed out")) == FailureType.TIMEOUT
        assert classifier.classify(Exception("Request timeout")) == FailureType.TIMEOUT

    def test_classify_rate_limit(self, classifier):
        """Should classify rate limit errors."""
        assert classifier.classify(Exception("Rate limit exceeded")) == FailureType.RATE_LIMIT
        assert classifier.classify(Exception("429 Too Many Requests")) == FailureType.RATE_LIMIT

    def test_classify_network(self, classifier):
        """Should classify network errors."""
        assert (
            classifier.classify(ConnectionError("Connection refused")) == FailureType.NETWORK_ERROR
        )
        assert classifier.classify(Exception("DNS resolution failed")) == FailureType.NETWORK_ERROR

    def test_classify_memory(self, classifier):
        """Should classify memory errors."""
        assert classifier.classify(MemoryError("Out of memory")) == FailureType.OUT_OF_MEMORY
        assert classifier.classify(Exception("OOM killer invoked")) == FailureType.OUT_OF_MEMORY

    def test_classify_validation(self, classifier):
        """Should classify validation errors."""
        assert classifier.classify(ValueError("Invalid input")) == FailureType.VALIDATION_ERROR
        assert classifier.classify(Exception("Validation failed")) == FailureType.VALIDATION_ERROR

    def test_classify_api_error(self, classifier):
        """Should classify API errors."""
        assert classifier.classify(Exception("API Error: 500")) == FailureType.API_ERROR
        assert classifier.classify(Exception("503 Service Unavailable")) == FailureType.API_ERROR

    def test_classify_unknown(self, classifier):
        """Should classify unknown errors."""
        assert classifier.classify(Exception("Something went wrong")) == FailureType.UNKNOWN

    def test_get_error_message(self, classifier):
        """Should get sanitized error message."""
        error = Exception("This is the error message")
        message = classifier.get_error_message(error)
        assert message == "This is the error message"

    def test_get_error_message_truncates(self, classifier):
        """Should truncate long error messages."""
        long_message = "x" * 1000
        error = Exception(long_message)
        message = classifier.get_error_message(error)
        assert len(message) == 500

    def test_classify_timeout_by_type(self, classifier):
        """Should classify TimeoutError by exception type when message doesn't match."""
        # Use a message that doesn't match any pattern
        error = TimeoutError("something happened")
        # The error_type will be "timeouterror" which contains "timeout" pattern
        # So we need a truly bare TimeoutError
        assert classifier.classify(error) == FailureType.TIMEOUT

    def test_classify_connection_by_type(self, classifier):
        """Should classify ConnectionError by exception type when message doesn't match."""
        # "connectionerror" type contains "connection" so pattern will match
        error = ConnectionError("failed")
        assert classifier.classify(error) == FailureType.NETWORK_ERROR

    def test_classify_memory_by_type(self, classifier):
        """Should classify MemoryError by exception type when message doesn't match."""
        # "memoryerror" type contains "memory" so pattern will match
        error = MemoryError("allocation failed")
        assert classifier.classify(error) == FailureType.OUT_OF_MEMORY

    def test_classify_value_error_no_pattern_match(self, classifier):
        """Should classify ValueError by exception type when message doesn't match patterns."""
        # "valueerror" type doesn't match any pattern - it only matches "validation" or "invalid"
        # So this will fall through to isinstance check
        error = ValueError("wrong type")
        assert classifier.classify(error) == FailureType.VALIDATION_ERROR


# =============================================================================
# RecoveryService Tests
# =============================================================================


class TestRecoveryService:
    """Tests for RecoveryService class."""

    @pytest.fixture
    def service(self):
        """Create a RecoveryService instance."""
        return RecoveryService()

    def test_create_operation(self, service):
        """Should create a new operation."""
        op = service.create_operation("chapter_generation", {"chapter": 5})
        assert op.operation_type == "chapter_generation"
        assert op.state == RecoveryState.PENDING
        assert op.context == {"chapter": 5}
        assert op.started_at is not None

    def test_checkpoint(self, service):
        """Should create checkpoints."""
        op = service.create_operation("test")
        cp = service.checkpoint(op, "Partial content", 0.5, {"key": "value"})

        assert cp.partial_result == "Partial content"
        assert cp.progress == 0.5
        assert cp.state == {"key": "value"}
        assert cp in op.checkpoints

    def test_checkpoint_clamps_progress(self, service):
        """Should clamp progress to 0-1 range."""
        op = service.create_operation("test")

        cp1 = service.checkpoint(op, "", -0.5)
        assert cp1.progress == 0.0

        cp2 = service.checkpoint(op, "", 1.5)
        assert cp2.progress == 1.0

    def test_mark_completed(self, service):
        """Should mark operation as completed."""
        op = service.create_operation("test")
        service.mark_completed(op, "Final result")

        assert op.state == RecoveryState.COMPLETED
        assert op.completed_at is not None
        assert len(op.checkpoints) == 1
        assert op.checkpoints[0].progress == 1.0

    def test_mark_failed(self, service):
        """Should mark operation as failed."""
        op = service.create_operation("test")
        service.mark_failed(op, TimeoutError("Timed out"))

        assert op.state == RecoveryState.FAILED
        assert op.last_failure == FailureType.TIMEOUT
        assert op.retry_count == 1

    def test_can_recover_checkpointed(self, service):
        """Should allow recovery of checkpointed operations."""
        op = service.create_operation("test")
        service.checkpoint(op, "Partial", 0.5)

        assert service.can_recover(op)

    def test_can_recover_failed(self, service):
        """Should allow recovery of failed operations with retryable errors."""
        op = service.create_operation("test")
        service.mark_failed(op, TimeoutError("Timeout"))

        assert service.can_recover(op)

    def test_cannot_recover_max_retries(self, service):
        """Should not allow recovery after max retries."""
        op = service.create_operation("test")
        for _ in range(4):  # Default max is 3
            service.mark_failed(op, TimeoutError("Timeout"))

        assert not service.can_recover(op)

    def test_cannot_recover_non_retryable(self, service):
        """Should not allow recovery of non-retryable failures."""
        op = service.create_operation("test")
        service.mark_failed(op, ValueError("Invalid"))

        assert not service.can_recover(op)

    def test_cannot_recover_completed(self, service):
        """Should not allow recovery of completed operations."""
        op = service.create_operation("test")
        service.mark_completed(op, "Done")

        assert not service.can_recover(op)

    def test_get_recovery_delay(self, service):
        """Should calculate recovery delay based on retry count."""
        op = service.create_operation("test")
        delay1 = service.get_recovery_delay(op)

        service.mark_failed(op, TimeoutError("Timeout"))
        delay2 = service.get_recovery_delay(op)

        # Second delay should be larger due to exponential backoff
        assert delay2 > delay1

    @pytest.mark.asyncio
    async def test_recover_success(self, service):
        """Should successfully recover an operation."""
        op = service.create_operation("test")
        service.checkpoint(op, "Partial", 0.5)

        async def generator(checkpoint):
            return "Full result"

        result = await service.recover(op, generator)
        assert result.success
        assert result.result == "Full result"
        assert result.recovered_from_checkpoint
        assert op.state == RecoveryState.RECOVERED

    @pytest.mark.asyncio
    async def test_recover_failure(self, service):
        """Should handle recovery failure."""
        op = service.create_operation("test")
        service.checkpoint(op, "Partial", 0.5)

        async def generator(checkpoint):
            raise TimeoutError("Still timing out")

        result = await service.recover(op, generator)
        assert not result.success
        assert "timing out" in result.error
        assert op.state == RecoveryState.FAILED

    @pytest.mark.asyncio
    async def test_recover_not_recoverable(self, service):
        """Should refuse to recover non-recoverable operations."""
        op = service.create_operation("test")
        op.state = RecoveryState.COMPLETED

        async def generator(checkpoint):
            return "Result"

        result = await service.recover(op, generator)
        assert not result.success
        assert "cannot be recovered" in result.error

    def test_abandon(self, service):
        """Should mark operation as abandoned."""
        op = service.create_operation("test")
        service.abandon(op)

        assert op.state == RecoveryState.ABANDONED

    def test_get_partial_result(self, service):
        """Should get partial results from operation."""
        op = service.create_operation("test")
        service.checkpoint(op, "Part 1", 0.3)
        service.checkpoint(op, "Part 2", 0.6)

        result = service.get_partial_result(op)
        assert result == "Part 1Part 2"

    def test_get_recoverable_operations(self, service):
        """Should list recoverable operations."""
        op1 = service.create_operation("test1")
        service.checkpoint(op1, "Partial", 0.5)

        op2 = service.create_operation("test2")
        service.mark_failed(op2, TimeoutError("Timeout"))

        op3 = service.create_operation("test3")
        service.mark_completed(op3, "Done")

        recoverable = service.get_recoverable_operations()
        assert len(recoverable) == 2
        assert op1 in recoverable
        assert op2 in recoverable

    def test_cleanup(self, service):
        """Should clean up old operations."""
        # Create old operation
        old_op = service.create_operation("old")
        old_op.started_at = datetime.utcnow() - timedelta(hours=48)
        service.store.save_operation(old_op)

        # Create new operation
        new_op = service.create_operation("new")

        removed = service.cleanup(max_age_hours=24)
        assert removed == 1
        assert service.store.get_operation(old_op.id) is None
        assert service.store.get_operation(new_op.id) is not None


# =============================================================================
# GenerationRecoveryWrapper Tests
# =============================================================================


class TestGenerationRecoveryWrapper:
    """Tests for GenerationRecoveryWrapper class."""

    @pytest.fixture
    def wrapper(self):
        """Create a GenerationRecoveryWrapper instance."""
        service = RecoveryService()
        return GenerationRecoveryWrapper(service)

    @pytest.mark.asyncio
    async def test_execute_with_recovery_success(self, wrapper):
        """Should execute successfully without retry."""

        async def generator(checkpoint):
            return "Success!"

        result = await wrapper.execute_with_recovery("test", generator)
        assert result.success
        assert result.result == "Success!"
        assert result.attempts == 1

    @pytest.mark.asyncio
    async def test_execute_with_recovery_retry(self, wrapper):
        """Should retry on retryable failure."""
        attempt_count = 0

        async def generator(checkpoint):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count < 2:
                raise TimeoutError("Timeout")
            return "Success after retry"

        result = await wrapper.execute_with_recovery("test", generator)
        assert result.success
        assert result.result == "Success after retry"
        assert result.attempts == 2

    @pytest.mark.asyncio
    async def test_execute_with_recovery_max_retries(self, wrapper):
        """Should stop after max retries."""

        async def generator(checkpoint):
            raise TimeoutError("Always timeout")

        result = await wrapper.execute_with_recovery("test", generator, max_retries=2)
        assert not result.success
        assert result.attempts == 2

    @pytest.mark.asyncio
    async def test_execute_with_recovery_non_retryable(self, wrapper):
        """Should not retry non-retryable failures."""

        async def generator(checkpoint):
            raise ValueError("Invalid input")

        result = await wrapper.execute_with_recovery("test", generator)
        assert not result.success
        assert result.attempts == 1

    @pytest.mark.asyncio
    async def test_execute_with_recovery_context(self, wrapper):
        """Should pass context to operation."""

        async def generator(checkpoint):
            return "Done"

        result = await wrapper.execute_with_recovery("test", generator, context={"chapter": 5})
        assert result.operation.context == {"chapter": 5}


# =============================================================================
# Utility Function Tests
# =============================================================================


class TestUtilityFunctions:
    """Tests for utility functions."""

    def test_compute_content_hash_deterministic(self):
        """Should produce consistent hash for same content."""
        content = "Hello, World!"
        hash1 = compute_content_hash(content)
        hash2 = compute_content_hash(content)
        assert hash1 == hash2

    def test_compute_content_hash_different_content(self):
        """Should produce different hash for different content."""
        hash1 = compute_content_hash("Content 1")
        hash2 = compute_content_hash("Content 2")
        assert hash1 != hash2

    def test_compute_content_hash_length(self):
        """Should produce hash of expected length."""
        hash_value = compute_content_hash("Test content")
        assert len(hash_value) == 16


# =============================================================================
# Integration Tests
# =============================================================================


class TestRecoveryIntegration:
    """Integration tests for recovery system."""

    @pytest.mark.asyncio
    async def test_full_recovery_workflow(self):
        """Should handle complete recovery workflow."""
        service = RecoveryService()
        wrapper = GenerationRecoveryWrapper(service)

        # Simulate a generation that fails then succeeds
        failure_count = [0]

        async def flaky_generator(checkpoint):
            failure_count[0] += 1
            if failure_count[0] < 3:
                raise TimeoutError(f"Attempt {failure_count[0]} failed")
            return "Finally succeeded!"

        result = await wrapper.execute_with_recovery(
            "chapter_generation",
            flaky_generator,
            context={"chapter": 1},
        )

        assert result.success
        assert result.result == "Finally succeeded!"
        assert result.attempts == 3
        assert result.operation.state == RecoveryState.COMPLETED

    @pytest.mark.asyncio
    async def test_checkpoint_based_recovery(self):
        """Should recover from checkpoints."""
        service = RecoveryService()

        # Create operation and checkpoint
        op = service.create_operation("test")
        service.checkpoint(op, "First half of content. ", 0.5)
        service.mark_failed(op, TimeoutError("Timeout"))

        # Recover with a generator that uses checkpoint
        async def recovery_generator(checkpoint):
            if checkpoint:
                return checkpoint.partial_result + "Second half completed."
            return "Full content without checkpoint."

        result = await service.recover(op, recovery_generator)

        assert result.success
        assert result.recovered_from_checkpoint
        assert "First half" in result.result
        assert "Second half" in result.result

    def test_multiple_checkpoints_accumulate(self):
        """Should accumulate content across multiple checkpoints."""
        service = RecoveryService()
        op = service.create_operation("test")

        service.checkpoint(op, "Chapter 1 content. ", 0.25)
        service.checkpoint(op, "Chapter 2 content. ", 0.50)
        service.checkpoint(op, "Chapter 3 content. ", 0.75)
        service.checkpoint(op, "Chapter 4 content.", 1.0)

        result = service.get_partial_result(op)
        assert "Chapter 1" in result
        assert "Chapter 2" in result
        assert "Chapter 3" in result
        assert "Chapter 4" in result
        assert op.get_total_progress() == 1.0
