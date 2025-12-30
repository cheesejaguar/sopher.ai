"""Generation recovery service for handling failures and preserving partial results.

This module provides checkpoint-based recovery for long-running generation tasks,
automatic retry with exponential backoff, and partial result preservation.
"""

import asyncio
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from uuid import UUID, uuid4


class RecoveryState(Enum):
    """State of a recoverable operation."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    CHECKPOINTED = "checkpointed"
    COMPLETED = "completed"
    FAILED = "failed"
    RECOVERED = "recovered"
    ABANDONED = "abandoned"


class FailureType(Enum):
    """Types of failures that can occur during generation."""

    TIMEOUT = "timeout"
    API_ERROR = "api_error"
    RATE_LIMIT = "rate_limit"
    VALIDATION_ERROR = "validation_error"
    NETWORK_ERROR = "network_error"
    OUT_OF_MEMORY = "out_of_memory"
    UNKNOWN = "unknown"


@dataclass
class Checkpoint:
    """A checkpoint representing a recoverable state in generation."""

    id: UUID = field(default_factory=uuid4)
    operation_id: UUID = field(default_factory=uuid4)
    sequence_number: int = 0
    state: dict[str, Any] = field(default_factory=dict)
    partial_result: str = ""
    progress: float = 0.0
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert checkpoint to dictionary for serialization."""
        return {
            "id": str(self.id),
            "operation_id": str(self.operation_id),
            "sequence_number": self.sequence_number,
            "state": self.state,
            "partial_result": self.partial_result,
            "progress": self.progress,
            "created_at": self.created_at.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Checkpoint":
        """Create checkpoint from dictionary."""
        return cls(
            id=UUID(data["id"]),
            operation_id=UUID(data["operation_id"]),
            sequence_number=data["sequence_number"],
            state=data.get("state", {}),
            partial_result=data.get("partial_result", ""),
            progress=data.get("progress", 0.0),
            created_at=datetime.fromisoformat(data["created_at"]),
            metadata=data.get("metadata", {}),
        )


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_retries: int = 3
    initial_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: float = 0.1
    retryable_failures: set[FailureType] = field(
        default_factory=lambda: {
            FailureType.TIMEOUT,
            FailureType.API_ERROR,
            FailureType.RATE_LIMIT,
            FailureType.NETWORK_ERROR,
        }
    )

    def get_delay(self, attempt: int) -> float:
        """Calculate delay for a given retry attempt with exponential backoff."""
        delay = min(
            self.initial_delay * (self.exponential_base**attempt),
            self.max_delay,
        )
        # Add jitter to prevent thundering herd
        import random

        jitter_amount = delay * self.jitter * random.random()
        return delay + jitter_amount

    def is_retryable(self, failure_type: FailureType) -> bool:
        """Check if a failure type should be retried."""
        return failure_type in self.retryable_failures


@dataclass
class RecoveryOperation:
    """Represents a recoverable operation with its state and history."""

    id: UUID = field(default_factory=uuid4)
    operation_type: str = ""
    state: RecoveryState = RecoveryState.PENDING
    checkpoints: list[Checkpoint] = field(default_factory=list)
    retry_count: int = 0
    last_failure: Optional[FailureType] = None
    last_error_message: str = ""
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    context: dict[str, Any] = field(default_factory=dict)

    def add_checkpoint(self, checkpoint: Checkpoint) -> None:
        """Add a checkpoint to the operation."""
        checkpoint.operation_id = self.id
        checkpoint.sequence_number = len(self.checkpoints)
        self.checkpoints.append(checkpoint)
        self.state = RecoveryState.CHECKPOINTED

    def get_latest_checkpoint(self) -> Optional[Checkpoint]:
        """Get the most recent checkpoint."""
        if not self.checkpoints:
            return None
        return max(self.checkpoints, key=lambda c: c.sequence_number)

    def get_partial_result(self) -> str:
        """Get combined partial results from all checkpoints."""
        if not self.checkpoints:
            return ""
        sorted_checkpoints = sorted(self.checkpoints, key=lambda c: c.sequence_number)
        return "".join(c.partial_result for c in sorted_checkpoints)

    def get_total_progress(self) -> float:
        """Get the overall progress of the operation."""
        if not self.checkpoints:
            return 0.0
        return max(c.progress for c in self.checkpoints)


class CheckpointStore:
    """In-memory store for checkpoints with optional persistence."""

    def __init__(self) -> None:
        self._operations: dict[UUID, RecoveryOperation] = {}
        self._checkpoints: dict[UUID, Checkpoint] = {}

    def save_operation(self, operation: RecoveryOperation) -> None:
        """Save an operation to the store."""
        self._operations[operation.id] = operation
        for checkpoint in operation.checkpoints:
            self._checkpoints[checkpoint.id] = checkpoint

    def get_operation(self, operation_id: UUID) -> Optional[RecoveryOperation]:
        """Retrieve an operation by ID."""
        return self._operations.get(operation_id)

    def save_checkpoint(self, checkpoint: Checkpoint) -> None:
        """Save a checkpoint to the store."""
        self._checkpoints[checkpoint.id] = checkpoint
        # Update parent operation if exists
        operation = self._operations.get(checkpoint.operation_id)
        if operation and checkpoint not in operation.checkpoints:
            operation.add_checkpoint(checkpoint)

    def get_checkpoint(self, checkpoint_id: UUID) -> Optional[Checkpoint]:
        """Retrieve a checkpoint by ID."""
        return self._checkpoints.get(checkpoint_id)

    def get_checkpoints_for_operation(self, operation_id: UUID) -> list[Checkpoint]:
        """Get all checkpoints for an operation."""
        return [c for c in self._checkpoints.values() if c.operation_id == operation_id]

    def delete_operation(self, operation_id: UUID) -> bool:
        """Delete an operation and its checkpoints."""
        if operation_id not in self._operations:
            return False
        operation = self._operations.pop(operation_id)
        for checkpoint in operation.checkpoints:
            self._checkpoints.pop(checkpoint.id, None)
        return True

    def get_recoverable_operations(self) -> list[RecoveryOperation]:
        """Get all operations that can be recovered."""
        return [
            op
            for op in self._operations.values()
            if op.state in {RecoveryState.CHECKPOINTED, RecoveryState.FAILED}
        ]

    def cleanup_old_operations(self, max_age: timedelta) -> int:
        """Remove operations older than max_age. Returns count of removed operations."""
        cutoff = datetime.utcnow() - max_age
        to_remove = [
            op_id
            for op_id, op in self._operations.items()
            if op.started_at and op.started_at < cutoff
        ]
        for op_id in to_remove:
            self.delete_operation(op_id)
        return len(to_remove)


class FailureClassifier:
    """Classifies exceptions into failure types for recovery decisions."""

    def __init__(self) -> None:
        self._patterns: dict[str, FailureType] = {
            "timeout": FailureType.TIMEOUT,
            "timed out": FailureType.TIMEOUT,
            "rate limit": FailureType.RATE_LIMIT,
            "rate_limit": FailureType.RATE_LIMIT,
            "too many requests": FailureType.RATE_LIMIT,
            "429": FailureType.RATE_LIMIT,
            "connection": FailureType.NETWORK_ERROR,
            "network": FailureType.NETWORK_ERROR,
            "dns": FailureType.NETWORK_ERROR,
            "memory": FailureType.OUT_OF_MEMORY,
            "oom": FailureType.OUT_OF_MEMORY,
            "validation": FailureType.VALIDATION_ERROR,
            "invalid": FailureType.VALIDATION_ERROR,
            "api error": FailureType.API_ERROR,
            "500": FailureType.API_ERROR,
            "502": FailureType.API_ERROR,
            "503": FailureType.API_ERROR,
        }

    def classify(self, error: Exception) -> FailureType:
        """Classify an exception into a failure type."""
        error_str = str(error).lower()
        error_type = type(error).__name__.lower()

        for pattern, failure_type in self._patterns.items():
            if pattern in error_str or pattern in error_type:
                return failure_type

        # Check for common exception types
        if isinstance(error, TimeoutError):
            return FailureType.TIMEOUT
        if isinstance(error, ConnectionError):
            return FailureType.NETWORK_ERROR
        if isinstance(error, MemoryError):
            return FailureType.OUT_OF_MEMORY
        if isinstance(error, ValueError):
            return FailureType.VALIDATION_ERROR

        return FailureType.UNKNOWN

    def get_error_message(self, error: Exception) -> str:
        """Get a sanitized error message."""
        return str(error)[:500]  # Limit length


@dataclass
class RecoveryResult:
    """Result of a recovery attempt."""

    success: bool
    operation: RecoveryOperation
    result: Optional[str] = None
    error: Optional[str] = None
    attempts: int = 0
    recovered_from_checkpoint: bool = False


class RecoveryService:
    """Main service for managing generation recovery."""

    def __init__(
        self,
        store: Optional[CheckpointStore] = None,
        retry_config: Optional[RetryConfig] = None,
        classifier: Optional[FailureClassifier] = None,
    ) -> None:
        self.store = store or CheckpointStore()
        self.retry_config = retry_config or RetryConfig()
        self.classifier = classifier or FailureClassifier()

    def create_operation(
        self,
        operation_type: str,
        context: Optional[dict[str, Any]] = None,
    ) -> RecoveryOperation:
        """Create a new recoverable operation."""
        operation = RecoveryOperation(
            operation_type=operation_type,
            state=RecoveryState.PENDING,
            started_at=datetime.utcnow(),
            context=context or {},
        )
        self.store.save_operation(operation)
        return operation

    def checkpoint(
        self,
        operation: RecoveryOperation,
        partial_result: str,
        progress: float,
        state: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Checkpoint:
        """Create a checkpoint for an operation."""
        checkpoint = Checkpoint(
            operation_id=operation.id,
            state=state or {},
            partial_result=partial_result,
            progress=min(max(progress, 0.0), 1.0),  # Clamp to 0-1
            metadata=metadata or {},
        )
        operation.add_checkpoint(checkpoint)
        self.store.save_checkpoint(checkpoint)
        return checkpoint

    def mark_completed(self, operation: RecoveryOperation, result: str) -> None:
        """Mark an operation as successfully completed."""
        operation.completed_at = datetime.utcnow()
        # Create final checkpoint with full result
        self.checkpoint(operation, result, 1.0, metadata={"final": True})
        # Set state AFTER checkpoint to avoid being overwritten
        operation.state = RecoveryState.COMPLETED
        self.store.save_operation(operation)

    def mark_failed(
        self,
        operation: RecoveryOperation,
        error: Exception,
    ) -> None:
        """Mark an operation as failed."""
        failure_type = self.classifier.classify(error)
        operation.state = RecoveryState.FAILED
        operation.last_failure = failure_type
        operation.last_error_message = self.classifier.get_error_message(error)
        operation.retry_count += 1
        self.store.save_operation(operation)

    def can_recover(self, operation: RecoveryOperation) -> bool:
        """Check if an operation can be recovered."""
        if operation.state not in {RecoveryState.CHECKPOINTED, RecoveryState.FAILED}:
            return False
        if operation.retry_count >= self.retry_config.max_retries:
            return False
        if operation.last_failure and not self.retry_config.is_retryable(operation.last_failure):
            return False
        return True

    def get_recovery_delay(self, operation: RecoveryOperation) -> float:
        """Get the delay before retrying an operation."""
        return self.retry_config.get_delay(operation.retry_count)

    async def recover(
        self,
        operation: RecoveryOperation,
        generator: Callable[[Optional[Checkpoint]], Any],
    ) -> RecoveryResult:
        """Attempt to recover an operation from its last checkpoint."""
        if not self.can_recover(operation):
            return RecoveryResult(
                success=False,
                operation=operation,
                error="Operation cannot be recovered",
                attempts=operation.retry_count,
            )

        # Get last checkpoint
        checkpoint = operation.get_latest_checkpoint()
        recovered_from = checkpoint is not None

        # Wait before retry
        delay = self.get_recovery_delay(operation)
        await asyncio.sleep(delay)

        # Update state
        operation.state = RecoveryState.IN_PROGRESS
        self.store.save_operation(operation)

        try:
            result = await generator(checkpoint)
            operation.state = RecoveryState.RECOVERED
            operation.completed_at = datetime.utcnow()
            self.store.save_operation(operation)
            return RecoveryResult(
                success=True,
                operation=operation,
                result=result,
                attempts=operation.retry_count + 1,
                recovered_from_checkpoint=recovered_from,
            )
        except Exception as e:
            self.mark_failed(operation, e)
            return RecoveryResult(
                success=False,
                operation=operation,
                error=str(e),
                attempts=operation.retry_count,
            )

    def abandon(self, operation: RecoveryOperation) -> None:
        """Mark an operation as abandoned (no more recovery attempts)."""
        operation.state = RecoveryState.ABANDONED
        self.store.save_operation(operation)

    def get_partial_result(self, operation: RecoveryOperation) -> str:
        """Get any partial results from an operation."""
        return operation.get_partial_result()

    def get_recoverable_operations(self) -> list[RecoveryOperation]:
        """Get all operations that can be recovered."""
        return [op for op in self.store.get_recoverable_operations() if self.can_recover(op)]

    def cleanup(self, max_age_hours: int = 24) -> int:
        """Clean up old operations. Returns count of removed operations."""
        return self.store.cleanup_old_operations(timedelta(hours=max_age_hours))


class GenerationRecoveryWrapper:
    """Wrapper that adds recovery capabilities to generation functions."""

    def __init__(
        self,
        recovery_service: RecoveryService,
        checkpoint_interval: int = 500,  # Words between checkpoints
    ) -> None:
        self.recovery_service = recovery_service
        self.checkpoint_interval = checkpoint_interval

    async def execute_with_recovery(
        self,
        operation_type: str,
        generator: Callable[..., Any],
        context: Optional[dict[str, Any]] = None,
        max_retries: Optional[int] = None,
    ) -> RecoveryResult:
        """Execute a generation function with automatic recovery."""
        operation = self.recovery_service.create_operation(operation_type, context)

        if max_retries is not None:
            original_max = self.recovery_service.retry_config.max_retries
            self.recovery_service.retry_config.max_retries = max_retries

        try:
            while True:
                operation.state = RecoveryState.IN_PROGRESS
                self.recovery_service.store.save_operation(operation)

                try:
                    checkpoint = operation.get_latest_checkpoint()
                    result = await generator(checkpoint)
                    self.recovery_service.mark_completed(operation, result)
                    return RecoveryResult(
                        success=True,
                        operation=operation,
                        result=result,
                        attempts=operation.retry_count + 1,
                        recovered_from_checkpoint=checkpoint is not None,
                    )
                except Exception as e:
                    self.recovery_service.mark_failed(operation, e)

                    if not self.recovery_service.can_recover(operation):
                        return RecoveryResult(
                            success=False,
                            operation=operation,
                            error=str(e),
                            attempts=operation.retry_count,
                        )

                    # Wait before retry
                    delay = self.recovery_service.get_recovery_delay(operation)
                    await asyncio.sleep(delay)
        finally:
            if max_retries is not None:
                self.recovery_service.retry_config.max_retries = original_max

    def create_checkpointing_generator(
        self,
        operation: RecoveryOperation,
        base_generator: Callable[..., Any],
    ) -> Callable[..., Any]:
        """Create a generator that automatically creates checkpoints."""

        async def checkpointing_gen(*args: Any, **kwargs: Any) -> str:
            result_chunks: list[str] = []
            word_count = 0

            async for chunk in base_generator(*args, **kwargs):
                result_chunks.append(chunk)
                word_count += len(chunk.split())

                if word_count >= self.checkpoint_interval:
                    partial = "".join(result_chunks)
                    progress = kwargs.get("target_progress", 0.5)
                    self.recovery_service.checkpoint(
                        operation,
                        partial,
                        progress,
                        metadata={"words": word_count},
                    )
                    word_count = 0

            return "".join(result_chunks)

        return checkpointing_gen


def compute_content_hash(content: str) -> str:
    """Compute a hash of content for deduplication."""
    return hashlib.sha256(content.encode()).hexdigest()[:16]
