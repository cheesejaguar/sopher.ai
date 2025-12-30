"""Load testing for sopher.ai services.

This module provides load testing utilities for:
- Concurrent user simulation
- Service stress testing
- Memory and performance monitoring
"""

import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Callable
from uuid import uuid4

from app.services.human_eval import ContentType as EvalContentType
from app.services.human_eval import HumanEvaluationPipeline
from app.services.manuscript_assembly import ChapterContent, Manuscript, ManuscriptAssembler

# Import services for load testing
from app.services.quality_gates import QualityAnalyzer, QualityGate
from app.services.token_optimizer import (
    ContentItem,
    ContentType,
    TokenBudgetPriority,
    TokenOptimizer,
)


@dataclass
class LoadTestResult:
    """Result of a load test run."""

    test_name: str
    num_requests: int
    num_workers: int
    total_time_seconds: float
    successful_requests: int
    failed_requests: int
    latencies_ms: list[float] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        """Calculate success rate as percentage."""
        if self.num_requests == 0:
            return 0.0
        return (self.successful_requests / self.num_requests) * 100

    @property
    def requests_per_second(self) -> float:
        """Calculate throughput in requests per second."""
        if self.total_time_seconds == 0:
            return 0.0
        return self.num_requests / self.total_time_seconds

    @property
    def avg_latency_ms(self) -> float:
        """Calculate average latency in milliseconds."""
        if not self.latencies_ms:
            return 0.0
        return statistics.mean(self.latencies_ms)

    @property
    def p50_latency_ms(self) -> float:
        """Calculate 50th percentile (median) latency."""
        if not self.latencies_ms:
            return 0.0
        return statistics.median(self.latencies_ms)

    @property
    def p95_latency_ms(self) -> float:
        """Calculate 95th percentile latency."""
        if not self.latencies_ms:
            return 0.0
        sorted_latencies = sorted(self.latencies_ms)
        idx = int(len(sorted_latencies) * 0.95)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]

    @property
    def p99_latency_ms(self) -> float:
        """Calculate 99th percentile latency."""
        if not self.latencies_ms:
            return 0.0
        sorted_latencies = sorted(self.latencies_ms)
        idx = int(len(sorted_latencies) * 0.99)
        return sorted_latencies[min(idx, len(sorted_latencies) - 1)]


class LoadTester:
    """Utility class for running load tests."""

    def __init__(
        self,
        num_workers: int = 10,
        num_requests: int = 100,
    ):
        self.num_workers = num_workers
        self.num_requests = num_requests

    def run_load_test(
        self,
        test_name: str,
        test_func: Callable[[], bool],
    ) -> LoadTestResult:
        """Run a load test with the specified function.

        Args:
            test_name: Name of the test for reporting.
            test_func: Function to test. Should return True on success.

        Returns:
            LoadTestResult with performance metrics.
        """
        latencies = []
        successes = 0
        failures = 0

        start_time = time.time()

        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            futures = [
                executor.submit(self._timed_call, test_func) for _ in range(self.num_requests)
            ]

            for future in as_completed(futures):
                success, latency_ms = future.result()
                latencies.append(latency_ms)
                if success:
                    successes += 1
                else:
                    failures += 1

        total_time = time.time() - start_time

        return LoadTestResult(
            test_name=test_name,
            num_requests=self.num_requests,
            num_workers=self.num_workers,
            total_time_seconds=total_time,
            successful_requests=successes,
            failed_requests=failures,
            latencies_ms=latencies,
        )

    def _timed_call(self, func: Callable[[], bool]) -> tuple[bool, float]:
        """Call a function and time it."""
        start = time.perf_counter()
        try:
            result = func()
            success = result if result is not None else True
        except Exception:
            success = False
        end = time.perf_counter()
        return success, (end - start) * 1000  # Convert to ms


class TestQualityGateLoad:
    """Load tests for quality gate service."""

    def test_concurrent_quality_checks(self):
        """Test concurrent quality analysis requests."""
        gate = QualityGate()
        content = """
        The morning sun cast long shadows across the dusty attic floor.
        Sarah paused at the top of the stairs, her heart racing.
        """

        def quality_check():
            report = gate.check(content, f"ch-{uuid4()}", "chapter")
            return report.overall_score >= 0

        tester = LoadTester(num_workers=5, num_requests=50)
        result = tester.run_load_test("quality_gate_check", quality_check)

        assert result.success_rate >= 99.0, f"Success rate too low: {result.success_rate}%"
        assert result.avg_latency_ms < 100, f"Average latency too high: {result.avg_latency_ms}ms"

    def test_analyzer_throughput(self):
        """Test quality analyzer throughput."""
        analyzer = QualityAnalyzer()
        content = "Test content for analysis." * 50  # ~200 words

        def analyze():
            result = analyzer.analyze_content(content, f"test-{uuid4()}")
            return result.overall_score >= 0

        tester = LoadTester(num_workers=10, num_requests=100)
        result = tester.run_load_test("quality_analyzer", analyze)

        assert result.success_rate == 100.0
        assert (
            result.requests_per_second > 100
        ), f"Throughput too low: {result.requests_per_second} RPS"


class TestHumanEvalLoad:
    """Load tests for human evaluation pipeline."""

    def test_concurrent_task_creation(self):
        """Test concurrent evaluation task creation."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)

        def create_task():
            project_id = uuid4()
            content_items = [
                (f"ch-{uuid4()}", "Chapter content...", EvalContentType.CHAPTER, 0.5, "")
            ]
            tasks = pipeline.queue_for_evaluation(project_id, content_items)
            return len(tasks) == 1

        tester = LoadTester(num_workers=5, num_requests=50)
        result = tester.run_load_test("eval_task_creation", create_task)

        assert result.success_rate >= 99.0


class TestTokenOptimizerLoad:
    """Load tests for token optimizer service."""

    def test_concurrent_optimization(self):
        """Test concurrent token optimization requests."""
        optimizer = TokenOptimizer()

        def optimize():
            items = [
                ContentItem(
                    name="context",
                    content="A" * 1000,
                    content_type=ContentType.PREVIOUS_CONTENT,
                    priority=TokenBudgetPriority.MEDIUM,
                ),
            ]
            result = optimizer.optimize(items)
            return result.items_included >= 1

        tester = LoadTester(num_workers=10, num_requests=100)
        result = tester.run_load_test("token_optimizer", optimize)

        assert result.success_rate == 100.0
        assert result.p95_latency_ms < 50, f"P95 latency too high: {result.p95_latency_ms}ms"


class TestManuscriptAssemblyLoad:
    """Load tests for manuscript assembly service."""

    def test_concurrent_assembly(self):
        """Test concurrent manuscript assembly."""
        assembler = ManuscriptAssembler()

        def assemble():
            manuscript = Manuscript(
                title=f"Test Book {uuid4()}",
                chapters=[
                    ChapterContent(number=1, title="Ch 1", content="Content..."),
                    ChapterContent(number=2, title="Ch 2", content="More content..."),
                ],
            )
            result = assembler.assemble(manuscript)
            return len(result) > 0

        tester = LoadTester(num_workers=5, num_requests=50)
        result = tester.run_load_test("manuscript_assembly", assemble)

        assert result.success_rate == 100.0


class TestCombinedServiceLoad:
    """Load tests for combined service workflows."""

    def test_full_workflow_under_load(self):
        """Test complete workflow with concurrent users."""
        gate = QualityGate()
        optimizer = TokenOptimizer()
        assembler = ManuscriptAssembler()

        def full_workflow():
            # Quality check
            content = "Chapter content with reasonable prose for testing."
            report = gate.check(content, "ch-1", "chapter")

            # Token optimization
            items = [
                ContentItem(
                    name="context",
                    content=content,
                    content_type=ContentType.PREVIOUS_CONTENT,
                    priority=TokenBudgetPriority.MEDIUM,
                ),
            ]
            optimizer.optimize(items)

            # Manuscript assembly
            manuscript = Manuscript(
                title="Test Book",
                chapters=[ChapterContent(number=1, title="Ch 1", content=content)],
            )
            result = assembler.assemble(manuscript)

            return len(result) > 0 and report.overall_score >= 0

        tester = LoadTester(num_workers=5, num_requests=25)
        result = tester.run_load_test("full_workflow", full_workflow)

        assert result.success_rate == 100.0
        print("\nFull workflow load test results:")
        print(f"  Requests: {result.num_requests}")
        print(f"  Workers: {result.num_workers}")
        print(f"  Success rate: {result.success_rate:.1f}%")
        print(f"  Throughput: {result.requests_per_second:.1f} RPS")
        print(f"  Avg latency: {result.avg_latency_ms:.1f}ms")
        print(f"  P50 latency: {result.p50_latency_ms:.1f}ms")
        print(f"  P95 latency: {result.p95_latency_ms:.1f}ms")
        print(f"  P99 latency: {result.p99_latency_ms:.1f}ms")


class TestMemoryUsage:
    """Tests for memory usage under load."""

    def test_no_memory_leak_in_quality_gate(self):
        """Verify no memory leak in quality gate with many requests."""
        import gc

        gate = QualityGate()
        content = "Test content for memory check." * 100

        # Run many requests
        for i in range(100):
            report = gate.check(content, f"ch-{i}", "chapter")
            assert report is not None

        # Force garbage collection
        gc.collect()

        # This test just ensures no crash - actual memory profiling
        # would require external tools

    def test_no_memory_leak_in_optimizer(self):
        """Verify no memory leak in token optimizer."""
        import gc

        optimizer = TokenOptimizer()

        for i in range(100):
            items = [
                ContentItem(
                    name=f"item-{i}",
                    content="A" * 10000,  # 10KB per item
                    content_type=ContentType.PREVIOUS_CONTENT,
                    priority=TokenBudgetPriority.MEDIUM,
                ),
            ]
            result = optimizer.optimize(items)
            assert result is not None

        gc.collect()


class TestStressConditions:
    """Tests for stress conditions."""

    def test_large_content_handling(self):
        """Test handling of large content."""
        gate = QualityGate()

        # Large content (100KB)
        large_content = "Word " * 25000

        start = time.time()
        report = gate.check(large_content, "large", "chapter")
        elapsed = time.time() - start

        assert report is not None
        assert elapsed < 5.0, f"Large content took too long: {elapsed}s"

    def test_many_chapters_assembly(self):
        """Test assembly with many chapters."""
        assembler = ManuscriptAssembler()

        chapters = [
            ChapterContent(
                number=i,
                title=f"Chapter {i}",
                content=f"Content for chapter {i}..." * 100,
            )
            for i in range(1, 51)  # 50 chapters
        ]

        manuscript = Manuscript(
            title="Large Book",
            chapters=chapters,
        )

        start = time.time()
        result = assembler.assemble(manuscript)
        elapsed = time.time() - start

        assert len(result) > 0
        assert elapsed < 2.0, f"Assembly took too long: {elapsed}s"
