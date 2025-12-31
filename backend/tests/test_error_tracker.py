"""Tests for error tracking and alerting system."""

from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.monitoring.error_tracker import (
    AlertLevel,
    AlertManager,
    AlertRule,
    ErrorCategorizer,
    ErrorCategory,
    ErrorContext,
    ErrorEvent,
    ErrorFingerprinter,
    ErrorStore,
    ErrorTracker,
    create_default_alert_rules,
)

# =============================================================================
# Enum Tests
# =============================================================================


class TestErrorCategory:
    """Tests for ErrorCategory enum."""

    def test_all_categories_exist(self):
        """All error categories should be defined."""
        assert ErrorCategory.AUTHENTICATION.value == "authentication"
        assert ErrorCategory.AUTHORIZATION.value == "authorization"
        assert ErrorCategory.VALIDATION.value == "validation"
        assert ErrorCategory.DATABASE.value == "database"
        assert ErrorCategory.EXTERNAL_API.value == "external_api"
        assert ErrorCategory.GENERATION.value == "generation"
        assert ErrorCategory.RATE_LIMIT.value == "rate_limit"
        assert ErrorCategory.TIMEOUT.value == "timeout"
        assert ErrorCategory.NETWORK.value == "network"
        assert ErrorCategory.INTERNAL.value == "internal"
        assert ErrorCategory.UNKNOWN.value == "unknown"

    def test_category_count(self):
        """Should have exactly 11 categories."""
        assert len(ErrorCategory) == 11


class TestAlertLevel:
    """Tests for AlertLevel enum."""

    def test_all_levels_exist(self):
        """All alert levels should be defined."""
        assert AlertLevel.INFO.value == "info"
        assert AlertLevel.WARNING.value == "warning"
        assert AlertLevel.ERROR.value == "error"
        assert AlertLevel.CRITICAL.value == "critical"

    def test_level_count(self):
        """Should have exactly 4 levels."""
        assert len(AlertLevel) == 4


# =============================================================================
# ErrorContext Tests
# =============================================================================


class TestErrorContext:
    """Tests for ErrorContext dataclass."""

    def test_default_values(self):
        """Should have None defaults."""
        context = ErrorContext()
        assert context.user_id is None
        assert context.project_id is None
        assert context.session_id is None
        assert context.request_id is None
        assert context.endpoint is None
        assert context.extra == {}

    def test_custom_values(self):
        """Should accept custom values."""
        context = ErrorContext(
            user_id="user-123",
            project_id="proj-456",
            endpoint="/api/v1/test",
            extra={"key": "value"},
        )
        assert context.user_id == "user-123"
        assert context.project_id == "proj-456"
        assert context.endpoint == "/api/v1/test"
        assert context.extra == {"key": "value"}


# =============================================================================
# ErrorEvent Tests
# =============================================================================


class TestErrorEvent:
    """Tests for ErrorEvent dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        event = ErrorEvent()
        assert event.id is not None
        assert event.category == ErrorCategory.UNKNOWN
        assert event.error_type == ""
        assert event.message == ""
        assert event.fingerprint == ""
        assert event.resolved is False
        assert event.tags == []

    def test_custom_values(self):
        """Should accept custom values."""
        context = ErrorContext(user_id="user-123")
        event = ErrorEvent(
            category=ErrorCategory.VALIDATION,
            error_type="ValueError",
            message="Invalid input",
            fingerprint="abc123",
            context=context,
            tags=["critical", "user-facing"],
        )
        assert event.category == ErrorCategory.VALIDATION
        assert event.error_type == "ValueError"
        assert event.message == "Invalid input"
        assert event.context.user_id == "user-123"
        assert "critical" in event.tags

    def test_to_dict(self):
        """Should serialize to dictionary."""
        event = ErrorEvent(
            error_type="ValueError",
            message="Test error",
        )
        data = event.to_dict()
        assert "id" in data
        assert data["error_type"] == "ValueError"
        assert data["message"] == "Test error"
        assert "timestamp" in data


# =============================================================================
# AlertRule Tests
# =============================================================================


class TestAlertRule:
    """Tests for AlertRule dataclass."""

    def test_default_values(self):
        """Should have sensible defaults."""
        rule = AlertRule()
        assert rule.threshold_count == 1
        assert rule.time_window_minutes == 5
        assert rule.level == AlertLevel.WARNING
        assert rule.enabled is True
        assert rule.cooldown_minutes == 15

    def test_matches_no_filters(self):
        """Rule with no filters should match all events."""
        rule = AlertRule()
        event = ErrorEvent(category=ErrorCategory.DATABASE)
        assert rule.matches(event)

    def test_matches_category_filter(self):
        """Rule with category filter should only match that category."""
        rule = AlertRule(category=ErrorCategory.DATABASE)
        db_event = ErrorEvent(category=ErrorCategory.DATABASE)
        auth_event = ErrorEvent(category=ErrorCategory.AUTHENTICATION)

        assert rule.matches(db_event)
        assert not rule.matches(auth_event)

    def test_matches_error_type_pattern(self):
        """Rule with pattern should match error types."""
        rule = AlertRule(error_type_pattern=r"Value.*Error")
        value_event = ErrorEvent(error_type="ValueError")
        type_event = ErrorEvent(error_type="TypeError")

        assert rule.matches(value_event)
        assert not rule.matches(type_event)

    def test_is_in_cooldown_not_triggered(self):
        """Should not be in cooldown if never triggered."""
        rule = AlertRule()
        assert not rule.is_in_cooldown()

    def test_is_in_cooldown_recent_trigger(self):
        """Should be in cooldown if recently triggered."""
        rule = AlertRule(cooldown_minutes=15)
        rule.last_triggered = datetime.utcnow()
        assert rule.is_in_cooldown()

    def test_is_in_cooldown_expired(self):
        """Should not be in cooldown if enough time has passed."""
        rule = AlertRule(cooldown_minutes=15)
        rule.last_triggered = datetime.utcnow() - timedelta(minutes=20)
        assert not rule.is_in_cooldown()


# =============================================================================
# ErrorCategorizer Tests
# =============================================================================


class TestErrorCategorizer:
    """Tests for ErrorCategorizer class."""

    @pytest.fixture
    def categorizer(self):
        """Create an ErrorCategorizer instance."""
        return ErrorCategorizer()

    def test_categorize_authentication(self, categorizer):
        """Should categorize auth errors."""
        assert (
            categorizer.categorize(Exception("Authentication failed"))
            == ErrorCategory.AUTHENTICATION
        )
        assert categorizer.categorize(Exception("Invalid token")) == ErrorCategory.AUTHENTICATION

    def test_categorize_authorization(self, categorizer):
        """Should categorize authorization errors."""
        assert categorizer.categorize(Exception("Permission denied")) == ErrorCategory.AUTHORIZATION
        assert categorizer.categorize(Exception("Access forbidden")) == ErrorCategory.AUTHORIZATION

    def test_categorize_validation(self, categorizer):
        """Should categorize validation errors."""
        assert categorizer.categorize(ValueError("Invalid input")) == ErrorCategory.VALIDATION
        assert (
            categorizer.categorize(Exception("Schema validation error")) == ErrorCategory.VALIDATION
        )

    def test_categorize_database(self, categorizer):
        """Should categorize database errors."""
        assert (
            categorizer.categorize(Exception("PostgreSQL connection failed"))
            == ErrorCategory.DATABASE
        )
        assert categorizer.categorize(Exception("SQL syntax error")) == ErrorCategory.DATABASE

    def test_categorize_external_api(self, categorizer):
        """Should categorize external API errors."""
        assert categorizer.categorize(Exception("OpenAI API error")) == ErrorCategory.EXTERNAL_API
        assert (
            categorizer.categorize(Exception("Anthropic rate limit")) == ErrorCategory.EXTERNAL_API
        )

    def test_categorize_rate_limit(self, categorizer):
        """Should categorize rate limit errors."""
        assert categorizer.categorize(Exception("Rate limit exceeded")) == ErrorCategory.RATE_LIMIT
        assert (
            categorizer.categorize(Exception("429 Too Many Requests")) == ErrorCategory.RATE_LIMIT
        )

    def test_categorize_timeout(self, categorizer):
        """Should categorize timeout errors."""
        assert categorizer.categorize(TimeoutError("Request timed out")) == ErrorCategory.TIMEOUT

    def test_categorize_network(self, categorizer):
        """Should categorize network errors."""
        assert (
            categorizer.categorize(ConnectionError("Connection refused")) == ErrorCategory.NETWORK
        )

    def test_categorize_unknown(self, categorizer):
        """Should categorize unknown errors."""
        assert categorizer.categorize(Exception("Something happened")) == ErrorCategory.UNKNOWN

    def test_categorize_permission_error_by_type(self, categorizer):
        """Should categorize PermissionError by exception type."""
        # Use message that doesn't match any pattern
        error = PermissionError("something went wrong")
        assert categorizer.categorize(error) == ErrorCategory.AUTHORIZATION

    def test_categorize_timeout_by_type(self, categorizer):
        """Should categorize TimeoutError by exception type when message doesn't match."""
        # Use message that doesn't contain "timeout" - error type "timeouterror" contains "timeout"
        # So this will still match the pattern. Let's verify the behavior.
        error = TimeoutError("operation failed")
        assert categorizer.categorize(error) == ErrorCategory.TIMEOUT

    def test_categorize_connection_error_by_type(self, categorizer):
        """Should categorize ConnectionError by exception type when message doesn't match."""
        # "connectionerror" type contains "connection" so pattern will match
        error = ConnectionError("failed")
        assert categorizer.categorize(error) == ErrorCategory.NETWORK


# =============================================================================
# ErrorFingerprinter Tests
# =============================================================================


class TestErrorFingerprinter:
    """Tests for ErrorFingerprinter class."""

    @pytest.fixture
    def fingerprinter(self):
        """Create an ErrorFingerprinter instance."""
        return ErrorFingerprinter()

    def test_fingerprint_deterministic(self, fingerprinter):
        """Same error should produce same fingerprint."""
        error = ValueError("Invalid input")
        fp1 = fingerprinter.fingerprint(error)
        fp2 = fingerprinter.fingerprint(error)
        assert fp1 == fp2

    def test_fingerprint_different_types(self, fingerprinter):
        """Different error types should produce different fingerprints."""
        fp1 = fingerprinter.fingerprint(ValueError("Error"))
        fp2 = fingerprinter.fingerprint(TypeError("Error"))
        assert fp1 != fp2

    def test_fingerprint_normalizes_uuids(self, fingerprinter):
        """Should normalize UUIDs in messages."""
        fp1 = fingerprinter.fingerprint(
            Exception("Project 123e4567-e89b-12d3-a456-426614174000 not found")
        )
        fp2 = fingerprinter.fingerprint(
            Exception("Project aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee not found")
        )
        assert fp1 == fp2

    def test_fingerprint_normalizes_numbers(self, fingerprinter):
        """Should normalize numbers in messages."""
        fp1 = fingerprinter.fingerprint(Exception("User 12345 not found"))
        fp2 = fingerprinter.fingerprint(Exception("User 67890 not found"))
        assert fp1 == fp2

    def test_fingerprint_length(self, fingerprinter):
        """Fingerprint should be 16 characters."""
        fp = fingerprinter.fingerprint(ValueError("Test"))
        assert len(fp) == 16


# =============================================================================
# ErrorStore Tests
# =============================================================================


class TestErrorStore:
    """Tests for ErrorStore class."""

    @pytest.fixture
    def store(self):
        """Create an ErrorStore instance."""
        return ErrorStore()

    def test_add_and_get(self, store):
        """Should add and retrieve events."""
        event = ErrorEvent(error_type="ValueError")
        store.add(event)
        retrieved = store.get(event.id)
        assert retrieved == event

    def test_get_nonexistent(self, store):
        """Should return None for nonexistent event."""
        assert store.get(uuid4()) is None

    def test_get_by_fingerprint(self, store):
        """Should get events by fingerprint."""
        event1 = ErrorEvent(fingerprint="abc123")
        event2 = ErrorEvent(fingerprint="abc123")
        event3 = ErrorEvent(fingerprint="xyz789")

        store.add(event1)
        store.add(event2)
        store.add(event3)

        events = store.get_by_fingerprint("abc123")
        assert len(events) == 2
        assert event1 in events
        assert event2 in events

    def test_get_by_category(self, store):
        """Should get events by category."""
        event1 = ErrorEvent(category=ErrorCategory.DATABASE)
        event2 = ErrorEvent(category=ErrorCategory.DATABASE)
        event3 = ErrorEvent(category=ErrorCategory.NETWORK)

        store.add(event1)
        store.add(event2)
        store.add(event3)

        events = store.get_by_category(ErrorCategory.DATABASE)
        assert len(events) == 2

    def test_get_recent(self, store):
        """Should get recent events."""
        old_event = ErrorEvent()
        old_event.timestamp = datetime.utcnow() - timedelta(hours=48)
        new_event = ErrorEvent()

        store.add(old_event)
        store.add(new_event)

        recent = store.get_recent(hours=24)
        assert len(recent) == 1
        assert new_event in recent

    def test_get_in_window(self, store):
        """Should get events in time window."""
        old_event = ErrorEvent()
        old_event.timestamp = datetime.utcnow() - timedelta(minutes=30)
        new_event = ErrorEvent()

        store.add(old_event)
        store.add(new_event)

        in_window = store.get_in_window(minutes=10)
        assert len(in_window) == 1
        assert new_event in in_window

    def test_count_by_fingerprint_in_window(self, store):
        """Should count events by fingerprint in window."""
        for _ in range(5):
            event = ErrorEvent(fingerprint="test-fp")
            store.add(event)

        count = store.count_by_fingerprint_in_window("test-fp", minutes=5)
        assert count == 5

    def test_mark_resolved(self, store):
        """Should mark event as resolved."""
        event = ErrorEvent()
        store.add(event)

        result = store.mark_resolved(event.id)
        assert result is True
        assert event.resolved is True

    def test_mark_resolved_nonexistent(self, store):
        """Should return False for nonexistent event."""
        result = store.mark_resolved(uuid4())
        assert result is False

    def test_cleanup_oldest(self, store):
        """Should clean up old events when limit is reached."""
        store = ErrorStore(max_events=10)

        for i in range(15):
            event = ErrorEvent(error_type=f"Error{i}")
            store.add(event)

        # Should have cleaned up oldest events
        assert len(store._events) <= 10


# =============================================================================
# AlertManager Tests
# =============================================================================


class TestAlertManager:
    """Tests for AlertManager class."""

    @pytest.fixture
    def manager(self):
        """Create an AlertManager instance."""
        return AlertManager()

    @pytest.fixture
    def store(self):
        """Create an ErrorStore instance."""
        return ErrorStore()

    def test_add_and_get_rules(self, manager):
        """Should add and retrieve rules."""
        rule = AlertRule(name="Test Rule")
        manager.add_rule(rule)

        rules = manager.get_rules()
        assert len(rules) == 1
        assert rules[0].name == "Test Rule"

    def test_remove_rule(self, manager):
        """Should remove rules."""
        rule = AlertRule()
        manager.add_rule(rule)

        result = manager.remove_rule(rule.id)
        assert result is True
        assert len(manager.get_rules()) == 0

    def test_remove_nonexistent_rule(self, manager):
        """Should return False for nonexistent rule."""
        result = manager.remove_rule(uuid4())
        assert result is False

    def test_check_and_trigger_below_threshold(self, manager, store):
        """Should not trigger alert below threshold."""
        rule = AlertRule(threshold_count=5, time_window_minutes=5)
        manager.add_rule(rule)

        event = ErrorEvent(fingerprint="test-fp")
        store.add(event)

        alerts = manager.check_and_trigger(event, store)
        assert len(alerts) == 0

    def test_check_and_trigger_at_threshold(self, manager, store):
        """Should trigger alert at threshold."""
        rule = AlertRule(name="Test Rule", threshold_count=3, time_window_minutes=5)
        manager.add_rule(rule)

        for _ in range(3):
            event = ErrorEvent(fingerprint="test-fp")
            store.add(event)

        event = ErrorEvent(fingerprint="test-fp")
        store.add(event)
        alerts = manager.check_and_trigger(event, store)
        assert len(alerts) == 1
        assert alerts[0].rule_name == "Test Rule"

    def test_check_and_trigger_respects_cooldown(self, manager, store):
        """Should not trigger during cooldown."""
        rule = AlertRule(threshold_count=1, cooldown_minutes=15)
        rule.last_triggered = datetime.utcnow()
        manager.add_rule(rule)

        event = ErrorEvent(fingerprint="test-fp")
        store.add(event)

        alerts = manager.check_and_trigger(event, store)
        assert len(alerts) == 0

    def test_register_handler(self, manager, store):
        """Should call registered handlers."""
        triggered_alerts = []

        def handler(alert):
            triggered_alerts.append(alert)

        manager.register_handler(handler)

        rule = AlertRule(threshold_count=1)
        manager.add_rule(rule)

        event = ErrorEvent(fingerprint="test-fp")
        store.add(event)
        manager.check_and_trigger(event, store)

        assert len(triggered_alerts) == 1

    def test_get_alerts(self, manager, store):
        """Should get alerts by time and level."""
        rule = AlertRule(threshold_count=1, level=AlertLevel.CRITICAL)
        manager.add_rule(rule)

        event = ErrorEvent(fingerprint="test-fp")
        store.add(event)
        manager.check_and_trigger(event, store)

        all_alerts = manager.get_alerts(hours=24)
        assert len(all_alerts) == 1

        critical_alerts = manager.get_alerts(hours=24, level=AlertLevel.CRITICAL)
        assert len(critical_alerts) == 1

        warning_alerts = manager.get_alerts(hours=24, level=AlertLevel.WARNING)
        assert len(warning_alerts) == 0

    def test_acknowledge_alert(self, manager, store):
        """Should acknowledge alerts."""
        rule = AlertRule(threshold_count=1)
        manager.add_rule(rule)

        event = ErrorEvent(fingerprint="test-fp")
        store.add(event)
        alerts = manager.check_and_trigger(event, store)

        result = manager.acknowledge_alert(alerts[0].id, "user-123")
        assert result is True
        assert alerts[0].acknowledged is True
        assert alerts[0].acknowledged_by == "user-123"


# =============================================================================
# ErrorTracker Tests
# =============================================================================


class TestErrorTracker:
    """Tests for ErrorTracker class."""

    @pytest.fixture
    def tracker(self):
        """Create an ErrorTracker instance."""
        return ErrorTracker()

    def test_capture_error(self, tracker):
        """Should capture an error."""
        error = ValueError("Test error")
        context = ErrorContext(user_id="user-123")

        event = tracker.capture(error, context, tags=["test"])

        assert event.error_type == "ValueError"
        assert event.message == "Test error"
        assert event.category == ErrorCategory.VALIDATION
        assert event.context.user_id == "user-123"
        assert "test" in event.tags

    def test_capture_categorizes_error(self, tracker):
        """Should correctly categorize errors."""
        db_error = Exception("PostgreSQL connection failed")
        event = tracker.capture(db_error)
        assert event.category == ErrorCategory.DATABASE

    def test_capture_fingerprints_error(self, tracker):
        """Should generate fingerprints."""
        error = ValueError("Test error")
        event = tracker.capture(error)
        assert len(event.fingerprint) == 16

    def test_get_stats(self, tracker):
        """Should calculate statistics."""
        for _ in range(5):
            tracker.capture(ValueError("Error 1"))
        for _ in range(3):
            tracker.capture(TypeError("Error 2"))

        stats = tracker.get_stats(hours=24)
        assert stats.total_count == 8
        assert ErrorCategory.VALIDATION in stats.count_by_category
        assert "ValueError" in stats.count_by_type

    def test_get_trending_errors(self, tracker):
        """Should get trending errors."""
        for _ in range(10):
            tracker.capture(ValueError("Common error"))
        for _ in range(3):
            tracker.capture(TypeError("Rare error"))

        trending = tracker.get_trending_errors(hours=24, limit=5)
        assert len(trending) == 2
        # Most common should be first
        assert trending[0][1] >= trending[1][1]

    def test_add_alert_rule(self, tracker):
        """Should add alert rules."""
        rule = AlertRule(name="Test Rule")
        tracker.add_alert_rule(rule)

        rules = tracker.alert_manager.get_rules()
        assert len(rules) == 1

    def test_register_alert_handler(self, tracker):
        """Should register alert handlers."""
        triggered = []
        tracker.register_alert_handler(lambda a: triggered.append(a))

        rule = AlertRule(threshold_count=1)
        tracker.add_alert_rule(rule)

        tracker.capture(ValueError("Test"))
        assert len(triggered) == 1

    def test_get_alerts(self, tracker):
        """Should get alerts."""
        rule = AlertRule(threshold_count=1)
        tracker.add_alert_rule(rule)
        tracker.capture(ValueError("Test"))

        alerts = tracker.get_alerts(hours=24)
        assert len(alerts) == 1

    def test_resolve_error(self, tracker):
        """Should resolve errors."""
        event = tracker.capture(ValueError("Test"))

        result = tracker.resolve_error(event.id)
        assert result is True

        stored_event = tracker.store.get(event.id)
        assert stored_event.resolved is True

    def test_acknowledge_alert(self, tracker):
        """Should acknowledge alerts."""
        rule = AlertRule(threshold_count=1)
        tracker.add_alert_rule(rule)
        tracker.capture(ValueError("Test"))

        alerts = tracker.get_alerts()
        result = tracker.acknowledge_alert(alerts[0].id, "admin")
        assert result is True


# =============================================================================
# Default Rules Tests
# =============================================================================


class TestDefaultAlertRules:
    """Tests for default alert rules."""

    def test_create_default_rules(self):
        """Should create default rules."""
        rules = create_default_alert_rules()
        assert len(rules) >= 5

    def test_default_rules_have_names(self):
        """Default rules should have names."""
        rules = create_default_alert_rules()
        for rule in rules:
            assert rule.name != ""

    def test_default_rules_are_enabled(self):
        """Default rules should be enabled."""
        rules = create_default_alert_rules()
        for rule in rules:
            assert rule.enabled is True


# =============================================================================
# Integration Tests
# =============================================================================


class TestErrorTrackerIntegration:
    """Integration tests for error tracking."""

    def test_full_workflow(self):
        """Should handle complete error tracking workflow."""
        tracker = ErrorTracker()

        # Add rules
        for rule in create_default_alert_rules():
            tracker.add_alert_rule(rule)

        # Track alert triggers
        triggered_alerts = []
        tracker.register_alert_handler(lambda a: triggered_alerts.append(a))

        # Capture some errors
        context = ErrorContext(
            user_id="user-123",
            project_id="proj-456",
            endpoint="/api/v1/generate",
        )

        # Capture multiple auth errors (should trigger alert)
        for i in range(15):
            tracker.capture(
                Exception("Authentication failed"),
                context,
                tags=["auth"],
            )

        # Get stats
        stats = tracker.get_stats()
        assert stats.total_count == 15
        assert stats.affected_users == 1
        assert stats.affected_projects == 1

        # Check alerts were triggered
        alerts = tracker.get_alerts()
        assert len(alerts) >= 1

        # Acknowledge alert
        tracker.acknowledge_alert(alerts[0].id, "admin")

    def test_error_deduplication(self):
        """Should deduplicate similar errors."""
        tracker = ErrorTracker()

        # Capture same error multiple times
        for i in range(10):
            tracker.capture(ValueError(f"User {i} not found"))

        # All should have same fingerprint despite different user IDs
        events = tracker.store.get_recent(hours=1)
        fingerprints = set(e.fingerprint for e in events)
        assert len(fingerprints) == 1

    def test_stats_over_time(self):
        """Should track stats over time."""
        tracker = ErrorTracker()

        # Capture errors at different times
        now = datetime.utcnow()
        for i in range(24):
            event = tracker.capture(ValueError("Test"))
            event.timestamp = now - timedelta(hours=i)

        stats = tracker.get_stats(hours=12)
        assert stats.total_count < 24
        assert stats.time_range_hours == 12
