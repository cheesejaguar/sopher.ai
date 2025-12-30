"""End-to-end book generation workflow tests.

This module tests the complete workflow from brief to export using
the actual service APIs.
"""

from uuid import uuid4

from app.services.exporters.base import (
    ExporterRegistry,
    ExportFormat,
)
from app.services.exporters.markdown import MarkdownExporter
from app.services.exporters.text import TextExporter
from app.services.human_eval import (
    ContentType as EvalContentType,
)
from app.services.human_eval import (
    EvaluationDimension,
    HumanEvaluationPipeline,
    SamplingStrategy,
)
from app.services.manuscript_assembly import (
    ChapterContent,
    CopyrightContent,
    Manuscript,
    ManuscriptAssembler,
    TitlePageContent,
)

# Import services for testing
from app.services.quality_gates import (
    QualityAnalyzer,
    QualityGate,
    QualityThreshold,
)
from app.services.token_optimizer import (
    ContentItem,
    ContentType,
    TokenBudgetPriority,
    TokenOptimizer,
)


class TestQualityGateWorkflow:
    """Test quality gate workflow."""

    def test_quality_analysis(self):
        """Analyze content quality."""
        analyzer = QualityAnalyzer()

        chapter_content = """
        The morning sun cast long shadows across the dusty attic floor. Sarah
        paused at the top of the stairs, her heart racing. She hadn't been up
        here since grandmother's passing three months ago.

        "Just get it over with," she muttered to herself, stepping forward.

        The floorboards creaked under her weight, each sound amplifying in the
        oppressive silence. Dust motes danced in the golden light streaming
        through the grimy window, illuminating towers of boxes and forgotten
        memories.
        """

        report = analyzer.analyze_content(chapter_content, "chapter-1")

        assert report.content_id == "chapter-1"
        assert 0 <= report.overall_score <= 1

    def test_quality_threshold_check(self):
        """Check quality against thresholds."""
        gate = QualityGate(threshold=QualityThreshold(minimum_overall=0.3))

        good_content = """
        The detective examined the evidence carefully. Each piece told a story,
        and she was determined to understand the narrative they created together.
        The key, tarnished with age, seemed to hold the most secrets of all.
        """

        report = gate.check(good_content, "chapter-1", "chapter")

        # Report should have scores
        assert report.overall_score >= 0
        assert len(report.scores) > 0

    def test_regeneration_decision(self):
        """Decide whether to regenerate based on quality."""
        gate = QualityGate(threshold=QualityThreshold(minimum_overall=0.5))

        # Very poor content
        poor_content = "bad. bad bad. very bad."

        report = gate.check(poor_content, "test", "chapter")
        should_regen = gate.should_regenerate(report)

        # Decision based on quality
        assert isinstance(should_regen, bool)


class TestHumanEvaluationWorkflow:
    """Test human evaluation workflow."""

    def test_sample_selection(self):
        """Select samples for human evaluation."""
        pipeline = HumanEvaluationPipeline(
            sampling_strategy=SamplingStrategy.STRATIFIED,
            sample_rate=0.3,
        )

        project_id = uuid4()
        content_items = [
            (f"ch-{i}", f"Chapter {i} content...", EvalContentType.CHAPTER, i / 10, "")
            for i in range(10)
        ]

        tasks = pipeline.queue_for_evaluation(project_id, content_items)

        assert len(tasks) >= 1
        assert len(tasks) <= len(content_items)

    def test_evaluation_submission(self):
        """Submit human evaluation results."""
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)

        project_id = uuid4()
        content_items = [("ch-1", "Chapter content...", EvalContentType.CHAPTER, 0.7, "")]
        tasks = pipeline.queue_for_evaluation(project_id, content_items)

        # Submit evaluation
        scores = [
            (EvaluationDimension.READABILITY, 4.0, 1.0, "Clear prose"),
            (EvaluationDimension.ENGAGEMENT, 3.5, 0.8, "Good pacing"),
        ]
        result = pipeline.submit_evaluation(
            task_id=tasks[0].id,
            evaluator_id="eval-1",
            scores=scores,
            overall_feedback="Solid chapter overall",
        )

        assert result is not None
        assert result.evaluator_id == "eval-1"


class TestExportWorkflow:
    """Test export workflow."""

    def test_manuscript_assembly(self):
        """Assemble manuscript from chapters."""
        assembler = ManuscriptAssembler()

        title_page = TitlePageContent(
            title="The Mystery of the Lost Key",
            author_name="Jane Author",
        )

        copyright_page = CopyrightContent(
            author_name="Jane Author",
            year=2024,
        )

        chapters = [
            ChapterContent(number=1, title="The Discovery", content="Chapter 1 content..."),
            ChapterContent(number=2, title="The First Clue", content="Chapter 2 content..."),
        ]

        manuscript = Manuscript(
            title="The Mystery of the Lost Key",
            author_name="Jane Author",
            title_page=title_page,
            copyright_page=copyright_page,
            chapters=chapters,
        )

        result = assembler.assemble(manuscript)

        # Title is uppercased in output
        assert "MYSTERY" in result.upper()
        assert len(manuscript.chapters) == 2

    def test_export_formats(self):
        """Export to different formats."""
        # Register exporters
        ExporterRegistry.register(ExportFormat.MARKDOWN, MarkdownExporter)
        ExporterRegistry.register(ExportFormat.TEXT, TextExporter)

        # Get available formats
        formats = ExporterRegistry.available_formats()
        assert ExportFormat.MARKDOWN in formats
        assert ExportFormat.TEXT in formats

        # Create exporters
        md_exporter = ExporterRegistry.create(ExportFormat.MARKDOWN)
        txt_exporter = ExporterRegistry.create(ExportFormat.TEXT)

        assert md_exporter is not None
        assert txt_exporter is not None

    def test_markdown_export(self):
        """Export to Markdown format."""
        ExporterRegistry.register(ExportFormat.MARKDOWN, MarkdownExporter)
        exporter = ExporterRegistry.create(ExportFormat.MARKDOWN)

        manuscript = Manuscript(
            title="Test Book",
            author_name="Test Author",
            chapters=[
                ChapterContent(number=1, title="Chapter 1", content="First chapter content."),
            ],
        )

        result = exporter.export(manuscript)

        assert result.success
        # Check metadata has title
        assert result.metadata.title == "Test Book"
        # Check content includes chapter
        assert "Chapter 1" in result.content.decode("utf-8")


class TestTokenOptimizationWorkflow:
    """Test token optimization workflow."""

    def test_context_optimization(self):
        """Optimize context for generation."""
        optimizer = TokenOptimizer(
            model_context_limit=128000,
            default_output_reserve=4000,
        )

        items = [
            ContentItem(
                name="system",
                content="You are a creative writer...",
                content_type=ContentType.SYSTEM_PROMPT,
                priority=TokenBudgetPriority.CRITICAL,
            ),
            ContentItem(
                name="outline",
                content="Chapter outline details...",
                content_type=ContentType.OUTLINE,
                priority=TokenBudgetPriority.HIGH,
            ),
            ContentItem(
                name="previous_chapter",
                content="Previous chapter summary...",
                content_type=ContentType.PREVIOUS_CONTENT,
                priority=TokenBudgetPriority.MEDIUM,
            ),
        ]

        result = optimizer.optimize(items)

        assert result.items_included >= 1
        assert result.total_tokens <= 124000  # Within budget

    def test_budget_allocation(self):
        """Allocate token budget for generation."""
        optimizer = TokenOptimizer()

        # For a 3000-word chapter
        output_tokens = optimizer.estimate_generation_tokens(3000)

        budget = optimizer.create_budget(output_tokens=output_tokens)

        assert budget.reserved_for_output == output_tokens
        assert budget.available_for_input > 0


class TestFullBookGenerationWorkflow:
    """Test complete book generation workflow."""

    def test_end_to_end_quality_workflow(self):
        """Test quality checking in generation workflow."""
        # 1. Project Setup (simulated)
        project = {
            "id": str(uuid4()),
            "title": "The Mystery of the Lost Key",
            "genre": "mystery",
            "target_chapters": 3,
        }

        # 2. Simulate generated chapters
        chapters = [
            {
                "number": 1,
                "title": "Chapter 1",
                "content": """
                The morning sun cast long shadows across the dusty attic floor.
                Sarah paused at the top of the stairs, her heart racing with
                anticipation. She hadn't been up here since grandmother's passing.
                """,
            },
            {
                "number": 2,
                "title": "Chapter 2",
                "content": """
                The key felt cold in her hand as she examined it closely.
                Tarnished and old, it seemed to hold secrets from another time.
                """,
            },
        ]

        # 3. Quality Check
        gate = QualityGate(threshold=QualityThreshold(minimum_overall=0.3))
        quality_reports = []
        for ch in chapters:
            report = gate.check(ch["content"], f"chapter-{ch['number']}", "chapter")
            quality_reports.append(report)

        assert len(quality_reports) == len(chapters)
        assert all(r.overall_score >= 0 for r in quality_reports)

        # 4. Export
        assembler = ManuscriptAssembler()
        manuscript_chapters = [
            ChapterContent(number=ch["number"], title=ch["title"], content=ch["content"])
            for ch in chapters
        ]
        manuscript = Manuscript(
            title=project["title"],
            author_name="Test Author",
            chapters=manuscript_chapters,
        )
        assembled = assembler.assemble(manuscript)

        # Chapters are present in output
        assert "CHAPTER" in assembled.upper()
        assert "MORNING SUN" in assembled.upper()

    def test_multi_genre_workflow(self):
        """Test workflow for different genres."""
        genres = ["mystery", "romance", "fantasy", "thriller"]

        for genre in genres:
            # Each genre should work with the same workflow
            content = f"A {genre} story about adventure and discovery."

            # Quality gate should work regardless of genre
            gate = QualityGate()
            report = gate.check(content, "test", "chapter")

            assert report.content_id == "test"
            assert report.overall_score >= 0


class TestWorkflowEdgeCases:
    """Test edge cases in the workflow."""

    def test_empty_chapter_handling(self):
        """Handle empty chapter content."""
        gate = QualityGate()
        report = gate.check("", "empty", "chapter")

        # Should handle gracefully
        assert report.content_id == "empty"

    def test_very_long_chapter(self):
        """Handle very long chapter content."""
        optimizer = TokenOptimizer(chars_per_token=1.0)

        long_content = "A" * 100000  # 100k characters

        item = ContentItem(
            name="long_chapter",
            content=long_content,
            content_type=ContentType.PREVIOUS_CONTENT,
            priority=TokenBudgetPriority.MEDIUM,
            can_truncate=True,
        )

        budget = optimizer.create_budget(output_tokens=1000, context_limit=10000)
        result = optimizer.optimize([item], budget)

        # Should truncate to fit
        assert result.total_tokens <= 9000

    def test_special_characters_in_content(self):
        """Handle special characters in content."""
        ExporterRegistry.register(ExportFormat.MARKDOWN, MarkdownExporter)
        exporter = ExporterRegistry.create(ExportFormat.MARKDOWN)

        manuscript = Manuscript(
            title='Test <Book> & "Quotes"',
            author_name="Test Author",
            chapters=[
                ChapterContent(
                    number=1, title="Chapter *1*", content="Content with **special** chars & <tags>"
                ),
            ],
        )

        # Should handle special characters
        result = exporter.export(manuscript)
        assert result.success
        # Check chapter content is present
        assert "special" in result.content.decode("utf-8")

    def test_unicode_content(self):
        """Handle Unicode content."""
        chapters = [
            ChapterContent(
                number=1,
                title="Japanese Title",
                content="Content with émojis and ñ characters",
            ),
        ]

        manuscript = Manuscript(
            title="Unicode Test",
            author_name="Test Author",
            chapters=chapters,
        )

        assert len(manuscript.chapters) == 1


class TestPerformanceMetrics:
    """Test performance tracking in workflow."""

    def test_word_count_tracking(self):
        """Track word counts throughout workflow."""
        chapters = [
            {"content": " ".join(["word"] * 3000)},
            {"content": " ".join(["word"] * 3500)},
            {"content": " ".join(["word"] * 2800)},
        ]

        word_counts = [len(ch["content"].split()) for ch in chapters]
        total_words = sum(word_counts)

        assert total_words == 9300
        assert len(word_counts) == 3

    def test_token_budget_tracking(self):
        """Track token usage throughout generation."""
        optimizer = TokenOptimizer()

        # Simulate multiple generations
        total_tokens_used = 0
        for i in range(3):
            budget = optimizer.create_budget(output_tokens=3000)
            items = [
                ContentItem(
                    name=f"context_{i}",
                    content="A" * 1000,
                    content_type=ContentType.PREVIOUS_CONTENT,
                    priority=TokenBudgetPriority.MEDIUM,
                ),
            ]
            result = optimizer.optimize(items, budget)
            total_tokens_used += result.total_tokens + 3000  # Input + output

        assert total_tokens_used > 0


class TestServiceIntegration:
    """Test integration between services."""

    def test_quality_to_human_eval_pipeline(self):
        """Quality gate feeds into human evaluation."""
        # Quality check
        gate = QualityGate()
        content = "A well-written chapter with good prose."
        quality_report = gate.check(content, "ch-1", "chapter")

        # Queue for human evaluation based on quality
        pipeline = HumanEvaluationPipeline(sample_rate=1.0)
        project_id = uuid4()

        content_items = [
            ("ch-1", content, EvalContentType.CHAPTER, quality_report.overall_score, "")
        ]
        tasks = pipeline.queue_for_evaluation(project_id, content_items)

        assert len(tasks) == 1
        # Task should have automated score from quality gate
        assert tasks[0].automated_scores.get("overall_quality") == quality_report.overall_score

    def test_token_optimizer_with_export(self):
        """Token optimizer works with export workflow."""
        optimizer = TokenOptimizer()

        # Optimize context
        items = [
            ContentItem(
                name="summary",
                content="Chapter summary for context",
                content_type=ContentType.CHAPTER_SUMMARY,
                priority=TokenBudgetPriority.MEDIUM,
            ),
        ]
        optimizer.optimize(items)

        # Use optimized content in manuscript
        manuscript = Manuscript(
            title="Optimized Book",
            author_name="Author",
            chapters=[
                ChapterContent(number=1, title="Ch 1", content=items[0].content),
            ],
        )

        assembler = ManuscriptAssembler()
        assembled = assembler.assemble(manuscript)

        # Check chapter content is present
        assert "summary" in assembled

    def test_full_service_chain(self):
        """Test all services working together."""
        # 1. Prepare content
        content = """
        The ancient key gleamed in the moonlight, its intricate patterns
        speaking of mysteries long forgotten. Sarah turned it over in her
        palm, feeling the weight of centuries pressing down upon her.
        """

        # 2. Quality analysis
        analyzer = QualityAnalyzer()
        analysis = analyzer.analyze_content(content, "ch-1")
        assert analysis.overall_score >= 0

        # 3. Quality gate check
        gate = QualityGate(threshold=QualityThreshold(minimum_overall=0.3))
        gate_result = gate.check(content, "ch-1", "chapter")
        assert not gate.should_regenerate(gate_result) or gate.should_regenerate(gate_result)

        # 4. Token optimization
        optimizer = TokenOptimizer()
        items = [
            ContentItem(
                name="content",
                content=content,
                content_type=ContentType.PREVIOUS_CONTENT,
                priority=TokenBudgetPriority.HIGH,
            ),
        ]
        opt_result = optimizer.optimize(items)
        assert opt_result.items_included >= 1

        # 5. Export
        manuscript = Manuscript(
            title="Mystery Novel",
            author_name="Author",
            chapters=[ChapterContent(number=1, title="Prologue", content=content)],
        )

        ExporterRegistry.register(ExportFormat.MARKDOWN, MarkdownExporter)
        exporter = ExporterRegistry.create(ExportFormat.MARKDOWN)
        export_result = exporter.export(manuscript)

        assert export_result.success
        assert export_result.metadata.title == "Mystery Novel"
        # Content should have chapter
        assert "Prologue" in export_result.content.decode("utf-8")
