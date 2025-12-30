"""Error tracking and alerting system.

This module provides comprehensive error tracking with categorization,
statistics, trend detection, and alerting capabilities.
"""

import hashlib
import re
import traceback
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from uuid import UUID, uuid4


class ErrorCategory(Enum):
    """Categories of errors for classification."""

    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    VALIDATION = "validation"
    DATABASE = "database"
    EXTERNAL_API = "external_api"
    GENERATION = "generation"
    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    NETWORK = "network"
    INTERNAL = "internal"
    UNKNOWN = "unknown"


class AlertLevel(Enum):
    """Severity levels for alerts."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ErrorContext:
    """Context information for an error event."""

    user_id: Optional[str] = None
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ErrorEvent:
    """Represents a single error event."""

    id: UUID = field(default_factory=uuid4)
    category: ErrorCategory = ErrorCategory.UNKNOWN
    error_type: str = ""
    message: str = ""
    stack_trace: str = ""
    fingerprint: str = ""
    context: ErrorContext = field(default_factory=ErrorContext)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    resolved: bool = False
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "id": str(self.id),
            "category": self.category.value,
            "error_type": self.error_type,
            "message": self.message,
            "stack_trace": self.stack_trace,
            "fingerprint": self.fingerprint,
            "context": {
                "user_id": self.context.user_id,
                "project_id": self.context.project_id,
                "session_id": self.context.session_id,
                "request_id": self.context.request_id,
                "endpoint": self.context.endpoint,
                "method": self.context.method,
                "extra": self.context.extra,
            },
            "timestamp": self.timestamp.isoformat(),
            "resolved": self.resolved,
            "tags": self.tags,
        }


@dataclass
class ErrorStats:
    """Statistics for error tracking."""

    total_count: int = 0
    count_by_category: dict[ErrorCategory, int] = field(default_factory=dict)
    count_by_type: dict[str, int] = field(default_factory=dict)
    count_by_hour: dict[int, int] = field(default_factory=dict)
    unique_fingerprints: int = 0
    affected_users: int = 0
    affected_projects: int = 0
    resolution_rate: float = 0.0
    time_range_hours: int = 24


@dataclass
class AlertRule:
    """Rule for triggering alerts based on error conditions."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    category: Optional[ErrorCategory] = None
    error_type_pattern: Optional[str] = None
    threshold_count: int = 1
    time_window_minutes: int = 5
    level: AlertLevel = AlertLevel.WARNING
    enabled: bool = True
    cooldown_minutes: int = 15
    last_triggered: Optional[datetime] = None

    def matches(self, event: ErrorEvent) -> bool:
        """Check if an error event matches this rule."""
        if self.category and event.category != self.category:
            return False
        if self.error_type_pattern:
            pattern = re.compile(self.error_type_pattern, re.IGNORECASE)
            if not pattern.search(event.error_type):
                return False
        return True

    def is_in_cooldown(self) -> bool:
        """Check if the rule is still in cooldown period."""
        if not self.last_triggered:
            return False
        cooldown_end = self.last_triggered + timedelta(minutes=self.cooldown_minutes)
        return datetime.utcnow() < cooldown_end


class ErrorCategorizer:
    """Categorizes errors based on exception type and message."""

    def __init__(self) -> None:
        self._patterns: list[tuple[str, ErrorCategory]] = [
            (r"auth.*fail|unauthorized|invalid.*token|jwt", ErrorCategory.AUTHENTICATION),
            (r"permission|forbidden|access.*denied", ErrorCategory.AUTHORIZATION),
            (r"validation|invalid.*input|schema", ErrorCategory.VALIDATION),
            (r"database|sql|postgres|mysql|sqlite|orm", ErrorCategory.DATABASE),
            (r"openai|anthropic|api.*key|external.*api", ErrorCategory.EXTERNAL_API),
            (r"generat|llm|model|completion", ErrorCategory.GENERATION),
            (r"rate.*limit|too.*many|429|throttl", ErrorCategory.RATE_LIMIT),
            (r"timeout|timed.*out", ErrorCategory.TIMEOUT),
            (r"connect|network|dns|socket", ErrorCategory.NETWORK),
        ]

    def categorize(self, error: Exception) -> ErrorCategory:
        """Categorize an exception."""
        error_str = f"{type(error).__name__} {str(error)}".lower()

        for pattern, category in self._patterns:
            if re.search(pattern, error_str):
                return category

        # Check exception type
        if isinstance(error, (PermissionError,)):
            return ErrorCategory.AUTHORIZATION
        if isinstance(error, (ValueError, TypeError)):
            return ErrorCategory.VALIDATION
        if isinstance(error, TimeoutError):
            return ErrorCategory.TIMEOUT
        if isinstance(error, ConnectionError):
            return ErrorCategory.NETWORK

        return ErrorCategory.UNKNOWN


class ErrorFingerprinter:
    """Generates fingerprints to identify unique error types."""

    def __init__(self) -> None:
        self._path_patterns = [
            (r'File ".*site-packages/', 'File "'),
            (r'File ".*backend/', 'File "app/'),
            (r"line \d+", "line X"),
            (r"0x[0-9a-f]+", "0xXXX"),
        ]

    def fingerprint(self, error: Exception, stack_trace: str = "") -> str:
        """Generate a fingerprint for an error."""
        # Base fingerprint on error type and normalized message
        error_type = type(error).__name__
        message = self._normalize_message(str(error))

        # Include normalized stack trace if available
        if stack_trace:
            normalized_trace = self._normalize_stack_trace(stack_trace)
            content = f"{error_type}:{message}:{normalized_trace}"
        else:
            content = f"{error_type}:{message}"

        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def _normalize_message(self, message: str) -> str:
        """Normalize error message by removing variable parts."""
        # Remove UUIDs
        message = re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "UUID",
            message,
            flags=re.IGNORECASE,
        )
        # Remove numbers
        message = re.sub(r"\b\d+\b", "N", message)
        # Remove quoted strings
        message = re.sub(r"'[^']*'", "'X'", message)
        message = re.sub(r'"[^"]*"', '"X"', message)
        return message.lower()

    def _normalize_stack_trace(self, trace: str) -> str:
        """Normalize stack trace by removing variable parts."""
        for pattern, replacement in self._path_patterns:
            trace = re.sub(pattern, replacement, trace)
        return trace[:500]  # Limit length


@dataclass
class Alert:
    """Represents a triggered alert."""

    id: UUID = field(default_factory=uuid4)
    rule_id: UUID = field(default_factory=uuid4)
    rule_name: str = ""
    level: AlertLevel = AlertLevel.WARNING
    message: str = ""
    event_count: int = 0
    sample_events: list[UUID] = field(default_factory=list)
    triggered_at: datetime = field(default_factory=datetime.utcnow)
    acknowledged: bool = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None


class ErrorStore:
    """In-memory store for error events."""

    def __init__(self, max_events: int = 10000) -> None:
        self._events: dict[UUID, ErrorEvent] = {}
        self._by_fingerprint: dict[str, list[UUID]] = defaultdict(list)
        self._by_category: dict[ErrorCategory, list[UUID]] = defaultdict(list)
        self._by_user: dict[str, list[UUID]] = defaultdict(list)
        self._by_project: dict[str, list[UUID]] = defaultdict(list)
        self._max_events = max_events

    def add(self, event: ErrorEvent) -> None:
        """Add an error event to the store."""
        self._events[event.id] = event
        self._by_fingerprint[event.fingerprint].append(event.id)
        self._by_category[event.category].append(event.id)
        if event.context.user_id:
            self._by_user[event.context.user_id].append(event.id)
        if event.context.project_id:
            self._by_project[event.context.project_id].append(event.id)

        # Cleanup old events if needed
        if len(self._events) > self._max_events:
            self._cleanup_oldest(self._max_events // 10)

    def get(self, event_id: UUID) -> Optional[ErrorEvent]:
        """Get an error event by ID."""
        return self._events.get(event_id)

    def get_by_fingerprint(self, fingerprint: str) -> list[ErrorEvent]:
        """Get all events with a specific fingerprint."""
        event_ids = self._by_fingerprint.get(fingerprint, [])
        return [self._events[eid] for eid in event_ids if eid in self._events]

    def get_by_category(self, category: ErrorCategory) -> list[ErrorEvent]:
        """Get all events in a category."""
        event_ids = self._by_category.get(category, [])
        return [self._events[eid] for eid in event_ids if eid in self._events]

    def get_recent(self, hours: int = 24) -> list[ErrorEvent]:
        """Get recent events within the specified hours."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return [e for e in self._events.values() if e.timestamp >= cutoff]

    def get_in_window(self, minutes: int) -> list[ErrorEvent]:
        """Get events within a time window."""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        return [e for e in self._events.values() if e.timestamp >= cutoff]

    def count_by_fingerprint_in_window(self, fingerprint: str, minutes: int) -> int:
        """Count events with a fingerprint within a time window."""
        events = self.get_by_fingerprint(fingerprint)
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        return sum(1 for e in events if e.timestamp >= cutoff)

    def mark_resolved(self, event_id: UUID) -> bool:
        """Mark an event as resolved."""
        event = self._events.get(event_id)
        if event:
            event.resolved = True
            return True
        return False

    def _cleanup_oldest(self, count: int) -> None:
        """Remove the oldest events."""
        sorted_events = sorted(self._events.values(), key=lambda e: e.timestamp)
        for event in sorted_events[:count]:
            del self._events[event.id]


class AlertManager:
    """Manages alert rules and triggered alerts."""

    def __init__(self) -> None:
        self._rules: dict[UUID, AlertRule] = {}
        self._alerts: list[Alert] = []
        self._handlers: list[Callable[[Alert], None]] = []

    def add_rule(self, rule: AlertRule) -> None:
        """Add an alert rule."""
        self._rules[rule.id] = rule

    def remove_rule(self, rule_id: UUID) -> bool:
        """Remove an alert rule."""
        if rule_id in self._rules:
            del self._rules[rule_id]
            return True
        return False

    def get_rules(self) -> list[AlertRule]:
        """Get all alert rules."""
        return list(self._rules.values())

    def register_handler(self, handler: Callable[[Alert], None]) -> None:
        """Register an alert handler."""
        self._handlers.append(handler)

    def check_and_trigger(
        self,
        event: ErrorEvent,
        store: "ErrorStore",
    ) -> list[Alert]:
        """Check rules and trigger alerts if conditions are met."""
        triggered = []

        for rule in self._rules.values():
            if not rule.enabled:
                continue
            if rule.is_in_cooldown():
                continue
            if not rule.matches(event):
                continue

            # Check threshold
            count = store.count_by_fingerprint_in_window(
                event.fingerprint, rule.time_window_minutes
            )
            if count >= rule.threshold_count:
                alert = self._create_alert(rule, event, count, store)
                self._trigger_alert(alert, rule)
                triggered.append(alert)

        return triggered

    def _create_alert(
        self,
        rule: AlertRule,
        event: ErrorEvent,
        count: int,
        store: "ErrorStore",
    ) -> Alert:
        """Create an alert from a rule match."""
        # Get sample events
        events = store.get_by_fingerprint(event.fingerprint)
        sample_ids = [e.id for e in events[:5]]

        return Alert(
            rule_id=rule.id,
            rule_name=rule.name,
            level=rule.level,
            message=f"{rule.name}: {count} occurrences of {event.error_type} in {rule.time_window_minutes} minutes",
            event_count=count,
            sample_events=sample_ids,
        )

    def _trigger_alert(self, alert: Alert, rule: AlertRule) -> None:
        """Trigger an alert and notify handlers."""
        rule.last_triggered = datetime.utcnow()
        self._alerts.append(alert)

        for handler in self._handlers:
            try:
                handler(alert)
            except Exception:
                pass  # Don't let handler errors break alerting

    def get_alerts(
        self,
        hours: int = 24,
        level: Optional[AlertLevel] = None,
    ) -> list[Alert]:
        """Get alerts from the specified time period."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        alerts = [a for a in self._alerts if a.triggered_at >= cutoff]
        if level:
            alerts = [a for a in alerts if a.level == level]
        return alerts

    def acknowledge_alert(self, alert_id: UUID, user_id: str) -> bool:
        """Acknowledge an alert."""
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                alert.acknowledged_by = user_id
                alert.acknowledged_at = datetime.utcnow()
                return True
        return False


class ErrorTracker:
    """Main error tracking service."""

    def __init__(
        self,
        store: Optional[ErrorStore] = None,
        alert_manager: Optional[AlertManager] = None,
        categorizer: Optional[ErrorCategorizer] = None,
        fingerprinter: Optional[ErrorFingerprinter] = None,
    ) -> None:
        self.store = store or ErrorStore()
        self.alert_manager = alert_manager or AlertManager()
        self.categorizer = categorizer or ErrorCategorizer()
        self.fingerprinter = fingerprinter or ErrorFingerprinter()

    def capture(
        self,
        error: Exception,
        context: Optional[ErrorContext] = None,
        tags: Optional[list[str]] = None,
    ) -> ErrorEvent:
        """Capture and track an error."""
        # Get stack trace
        stack_trace = traceback.format_exc()

        # Categorize and fingerprint
        category = self.categorizer.categorize(error)
        fingerprint = self.fingerprinter.fingerprint(error, stack_trace)

        # Create event
        event = ErrorEvent(
            category=category,
            error_type=type(error).__name__,
            message=str(error)[:1000],
            stack_trace=stack_trace[:5000],
            fingerprint=fingerprint,
            context=context or ErrorContext(),
            tags=tags or [],
        )

        # Store event
        self.store.add(event)

        # Check alerts
        self.alert_manager.check_and_trigger(event, self.store)

        return event

    def get_stats(self, hours: int = 24) -> ErrorStats:
        """Get error statistics for the specified time period."""
        events = self.store.get_recent(hours)

        if not events:
            return ErrorStats(time_range_hours=hours)

        # Count by category
        count_by_category: dict[ErrorCategory, int] = defaultdict(int)
        for event in events:
            count_by_category[event.category] += 1

        # Count by type
        count_by_type: dict[str, int] = defaultdict(int)
        for event in events:
            count_by_type[event.error_type] += 1

        # Count by hour
        count_by_hour: dict[int, int] = defaultdict(int)
        for event in events:
            hour = event.timestamp.hour
            count_by_hour[hour] += 1

        # Unique counts
        fingerprints = set(e.fingerprint for e in events)
        users = set(e.context.user_id for e in events if e.context.user_id)
        projects = set(e.context.project_id for e in events if e.context.project_id)

        # Resolution rate
        resolved = sum(1 for e in events if e.resolved)
        resolution_rate = resolved / len(events) if events else 0.0

        return ErrorStats(
            total_count=len(events),
            count_by_category=dict(count_by_category),
            count_by_type=dict(count_by_type),
            count_by_hour=dict(count_by_hour),
            unique_fingerprints=len(fingerprints),
            affected_users=len(users),
            affected_projects=len(projects),
            resolution_rate=resolution_rate,
            time_range_hours=hours,
        )

    def get_trending_errors(self, hours: int = 24, limit: int = 10) -> list[tuple[str, int, str]]:
        """Get trending errors by fingerprint.

        Returns list of (fingerprint, count, sample_message) tuples.
        """
        events = self.store.get_recent(hours)
        fingerprint_counts: dict[str, int] = defaultdict(int)
        fingerprint_messages: dict[str, str] = {}

        for event in events:
            fingerprint_counts[event.fingerprint] += 1
            if event.fingerprint not in fingerprint_messages:
                fingerprint_messages[event.fingerprint] = event.message[:100]

        sorted_fingerprints = sorted(fingerprint_counts.items(), key=lambda x: x[1], reverse=True)[
            :limit
        ]

        return [(fp, count, fingerprint_messages.get(fp, "")) for fp, count in sorted_fingerprints]

    def add_alert_rule(self, rule: AlertRule) -> None:
        """Add an alert rule."""
        self.alert_manager.add_rule(rule)

    def register_alert_handler(self, handler: Callable[[Alert], None]) -> None:
        """Register an alert handler."""
        self.alert_manager.register_handler(handler)

    def get_alerts(
        self,
        hours: int = 24,
        level: Optional[AlertLevel] = None,
    ) -> list[Alert]:
        """Get recent alerts."""
        return self.alert_manager.get_alerts(hours, level)

    def resolve_error(self, event_id: UUID) -> bool:
        """Mark an error as resolved."""
        return self.store.mark_resolved(event_id)

    def acknowledge_alert(self, alert_id: UUID, user_id: str) -> bool:
        """Acknowledge an alert."""
        return self.alert_manager.acknowledge_alert(alert_id, user_id)


# Default alert rules for common scenarios
def create_default_alert_rules() -> list[AlertRule]:
    """Create default alert rules for common error scenarios."""
    return [
        AlertRule(
            name="High Error Rate",
            description="Alert when error rate exceeds threshold",
            threshold_count=50,
            time_window_minutes=5,
            level=AlertLevel.WARNING,
        ),
        AlertRule(
            name="Critical Authentication Failures",
            description="Alert on multiple authentication failures",
            category=ErrorCategory.AUTHENTICATION,
            threshold_count=10,
            time_window_minutes=5,
            level=AlertLevel.ERROR,
        ),
        AlertRule(
            name="Database Errors",
            description="Alert on database connection issues",
            category=ErrorCategory.DATABASE,
            threshold_count=5,
            time_window_minutes=5,
            level=AlertLevel.CRITICAL,
        ),
        AlertRule(
            name="External API Failures",
            description="Alert on external API issues",
            category=ErrorCategory.EXTERNAL_API,
            threshold_count=10,
            time_window_minutes=10,
            level=AlertLevel.ERROR,
        ),
        AlertRule(
            name="Rate Limiting Exceeded",
            description="Alert on rate limit errors",
            category=ErrorCategory.RATE_LIMIT,
            threshold_count=20,
            time_window_minutes=5,
            level=AlertLevel.WARNING,
        ),
    ]
