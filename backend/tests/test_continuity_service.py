"""
Tests for continuity service.

Tests cover:
- Character tracking
- Physical description analysis
- Knowledge state tracking
- Location tracking
- Timeline analysis
- World rule checking
- Full continuity checks
"""

from app.services.continuity_service import (
    CharacterExtractor,
    CharacterTracker,
    ContinuityIssue,
    ContinuityService,
    IssueSeverity,
    IssueType,
    KnowledgeStateAnalyzer,
    LocationTracker,
    PhysicalDescriptionAnalyzer,
    TimelineAnalyzer,
    TimelineEvent,
    TimeOfDay,
    WorldRule,
)


class TestCharacterTracker:
    """Tests for CharacterTracker."""

    def test_create_character_tracker(self):
        """Test creating a character tracker."""
        tracker = CharacterTracker(name="Alice", aliases=["Ali"])
        assert tracker.name == "Alice"
        assert tracker.aliases == ["Ali"]
        assert tracker.first_appearance is None

    def test_add_physical_description(self):
        """Test adding physical descriptions."""
        tracker = CharacterTracker(name="Bob")
        tracker.add_physical_description(1, "tall with dark hair")
        tracker.add_physical_description(3, "blue eyes")

        assert len(tracker.physical_descriptions) == 2
        assert "tall with dark hair" in tracker.physical_descriptions[1]
        assert "blue eyes" in tracker.physical_descriptions[3]

    def test_add_multiple_descriptions_same_chapter(self):
        """Test adding multiple descriptions in the same chapter."""
        tracker = CharacterTracker(name="Carol")
        tracker.add_physical_description(2, "red hair")
        tracker.add_physical_description(2, "freckles")

        assert len(tracker.physical_descriptions[2]) == 2
        assert "red hair" in tracker.physical_descriptions[2]
        assert "freckles" in tracker.physical_descriptions[2]

    def test_add_personality_trait(self):
        """Test adding personality traits."""
        tracker = CharacterTracker(name="Dave")
        tracker.add_personality_trait(1, "brave")
        tracker.add_personality_trait(2, "kind")
        tracker.add_personality_trait(2, "brave")  # Duplicate

        assert "brave" in tracker.personality_traits[1]
        assert "kind" in tracker.personality_traits[2]
        # Should not add duplicate
        assert tracker.personality_traits[2].count("brave") == 1

    def test_add_knowledge(self):
        """Test adding character knowledge."""
        tracker = CharacterTracker(name="Eve")
        tracker.add_knowledge(1, "knows about the treasure")
        tracker.add_knowledge(3, "knows the villain's plan")

        assert "knows about the treasure" in tracker.knowledge[1]
        assert "knows the villain's plan" in tracker.knowledge[3]

    def test_get_knowledge_at_chapter(self):
        """Test getting cumulative knowledge at a chapter."""
        tracker = CharacterTracker(name="Frank")
        tracker.add_knowledge(1, "fact 1")
        tracker.add_knowledge(3, "fact 2")
        tracker.add_knowledge(5, "fact 3")

        # At chapter 1, only fact 1
        assert tracker.get_knowledge_at_chapter(1) == {"fact 1"}

        # At chapter 3, facts 1 and 2
        assert tracker.get_knowledge_at_chapter(3) == {"fact 1", "fact 2"}

        # At chapter 5, all facts
        assert tracker.get_knowledge_at_chapter(5) == {"fact 1", "fact 2", "fact 3"}

        # At chapter 4, facts 1 and 2 (not 3 yet)
        assert tracker.get_knowledge_at_chapter(4) == {"fact 1", "fact 2"}

    def test_set_location(self):
        """Test setting character location."""
        tracker = CharacterTracker(name="Grace")
        tracker.set_location(1, "Village")
        tracker.set_location(3, "Forest")

        assert tracker.locations[1] == "Village"
        assert tracker.locations[3] == "Forest"

    def test_set_emotional_state(self):
        """Test setting emotional state."""
        tracker = CharacterTracker(name="Henry")
        tracker.set_emotional_state(1, "happy")
        tracker.set_emotional_state(5, "anxious")

        assert tracker.emotional_states[1] == "happy"
        assert tracker.emotional_states[5] == "anxious"


class TestPhysicalDescriptionAnalyzer:
    """Tests for PhysicalDescriptionAnalyzer."""

    def test_extract_eye_color(self):
        """Test extracting eye color from text."""
        text = "Alice looked at him with her blue eyes."
        attrs = PhysicalDescriptionAnalyzer.extract_attributes(text, "Alice")

        assert "eye_color" in attrs
        assert "blue" in attrs["eye_color"]

    def test_extract_hair_description(self):
        """Test extracting hair description from text."""
        text = "Bob ran his fingers through his dark curly hair."
        attrs = PhysicalDescriptionAnalyzer.extract_attributes(text, "Bob")

        assert "hair" in attrs

    def test_extract_height(self):
        """Test extracting height from text."""
        text = "Carol stood at 5'8\" tall."
        attrs = PhysicalDescriptionAnalyzer.extract_attributes(text, "Carol")

        assert "height" in attrs

    def test_extract_age(self):
        """Test extracting age from text."""
        text = "Dave was 25 years old."
        attrs = PhysicalDescriptionAnalyzer.extract_attributes(text, "Dave")

        assert "age" in attrs
        assert "25" in attrs["age"]

    def test_find_eye_color_inconsistency(self):
        """Test finding eye color inconsistency."""
        tracker = CharacterTracker(name="Eve")
        tracker.add_physical_description(1, "her blue eyes")
        tracker.add_physical_description(5, "her green eyes")

        issues = PhysicalDescriptionAnalyzer.find_inconsistencies(tracker)

        assert len(issues) == 1
        assert issues[0].issue_type == IssueType.CHARACTER
        assert issues[0].severity == IssueSeverity.ERROR
        assert "blue" in issues[0].description
        assert "green" in issues[0].description

    def test_no_inconsistency_same_description(self):
        """Test no inconsistency when descriptions match."""
        tracker = CharacterTracker(name="Frank")
        tracker.add_physical_description(1, "his blue eyes")
        tracker.add_physical_description(5, "his blue eyes")

        issues = PhysicalDescriptionAnalyzer.find_inconsistencies(tracker)

        assert len(issues) == 0


class TestKnowledgeStateAnalyzer:
    """Tests for KnowledgeStateAnalyzer."""

    def test_extract_learned_knowledge(self):
        """Test extracting knowledge that a character learns."""
        text = "Alice realized that the treasure was hidden in the cave."
        learned, _ = KnowledgeStateAnalyzer.extract_knowledge_changes(text, "Alice")

        assert len(learned) >= 1

    def test_extract_referenced_knowledge(self):
        """Test extracting knowledge that a character references."""
        text = "Bob remembered that the key was under the mat."
        _, referenced = KnowledgeStateAnalyzer.extract_knowledge_changes(text, "Bob")

        assert len(referenced) >= 1

    def test_find_knowledge_issue(self):
        """Test finding knowledge state issue."""
        tracker = CharacterTracker(name="Carol")
        # Carol learns something in chapter 5
        tracker.add_knowledge(5, "the secret passage")

        chapters = {
            3: "Carol remembered that the secret passage led to the tower.",
            5: "Carol discovered that the secret passage led to the tower.",
        }

        issues = KnowledgeStateAnalyzer.find_knowledge_issues(tracker, chapters)

        # Carol shouldn't know about the passage in chapter 3
        assert len(issues) >= 1
        assert issues[0].issue_type == IssueType.PLOT_HOLE


class TestLocationTracker:
    """Tests for LocationTracker."""

    def test_extract_location(self):
        """Test extracting location from text."""
        text = "Dave walked into the library and sat down."
        location = LocationTracker.extract_location(text, "Dave")

        assert location is not None

    def test_find_teleportation_issue(self):
        """Test finding teleportation issues."""
        tracker = CharacterTracker(name="Eve")
        tracker.set_location(1, "Village")
        tracker.set_location(2, "Mountain")

        chapters = {
            1: "Eve was in the Village.",
            2: "Eve stood on the Mountain peak.",
        }

        issues = LocationTracker.find_teleportation_issues(tracker, chapters)

        assert len(issues) == 1
        assert "Village" in issues[0].description
        assert "Mountain" in issues[0].description

    def test_no_issue_with_travel_mentioned(self):
        """Test no issue when travel is mentioned."""
        tracker = CharacterTracker(name="Frank")
        tracker.set_location(1, "Village")
        tracker.set_location(2, "Forest")

        chapters = {
            1: "Frank was in the Village.",
            2: "Frank traveled to the Forest.",
        }

        issues = LocationTracker.find_teleportation_issues(tracker, chapters)

        assert len(issues) == 0


class TestTimelineEvent:
    """Tests for TimelineEvent."""

    def test_create_timeline_event(self):
        """Test creating a timeline event."""
        event = TimelineEvent(
            id="e1",
            chapter_number=3,
            description="The hero finds the map.",
            time_of_day=TimeOfDay.MORNING,
            day_number=5,
        )

        assert event.id == "e1"
        assert event.chapter_number == 3
        assert event.time_of_day == TimeOfDay.MORNING
        assert event.day_number == 5

    def test_timeline_event_sorting(self):
        """Test timeline event sorting."""
        events = [
            TimelineEvent(id="e3", chapter_number=3, description="Third", position_in_text=100),
            TimelineEvent(id="e1", chapter_number=1, description="First", position_in_text=50),
            TimelineEvent(id="e2", chapter_number=2, description="Second", position_in_text=75),
        ]

        sorted_events = sorted(events)

        assert sorted_events[0].id == "e1"
        assert sorted_events[1].id == "e2"
        assert sorted_events[2].id == "e3"

    def test_timeline_event_sorting_same_chapter(self):
        """Test timeline event sorting within same chapter."""
        events = [
            TimelineEvent(id="e2", chapter_number=1, description="Second", position_in_text=200),
            TimelineEvent(id="e1", chapter_number=1, description="First", position_in_text=100),
        ]

        sorted_events = sorted(events)

        assert sorted_events[0].id == "e1"
        assert sorted_events[1].id == "e2"


class TestTimelineAnalyzer:
    """Tests for TimelineAnalyzer."""

    def test_extract_time_of_day(self):
        """Test extracting time of day from text."""
        assert TimelineAnalyzer.extract_time_of_day("The sun rose at dawn.") == TimeOfDay.DAWN
        assert (
            TimelineAnalyzer.extract_time_of_day("It was a beautiful morning.") == TimeOfDay.MORNING
        )
        assert TimelineAnalyzer.extract_time_of_day("They met at noon.") == TimeOfDay.NOON
        assert TimelineAnalyzer.extract_time_of_day("Late in the afternoon.") == TimeOfDay.AFTERNOON
        assert TimelineAnalyzer.extract_time_of_day("The sun set.") == TimeOfDay.EVENING
        assert TimelineAnalyzer.extract_time_of_day("Dark night fell.") == TimeOfDay.NIGHT

    def test_detect_day_change(self):
        """Test detecting day changes."""
        assert TimelineAnalyzer.detect_day_change("The next day, they continued.") is True
        assert TimelineAnalyzer.detect_day_change("The following day.") is True
        assert TimelineAnalyzer.detect_day_change("Two days later.") is True
        assert TimelineAnalyzer.detect_day_change("They continued walking.") is False

    def test_find_time_backwards_issue(self):
        """Test finding time going backwards within same day."""
        events = [
            TimelineEvent(
                id="e1",
                chapter_number=1,
                description="Breakfast",
                time_of_day=TimeOfDay.EVENING,
                day_number=1,
                position_in_text=100,
            ),
            TimelineEvent(
                id="e2",
                chapter_number=1,
                description="Dinner",
                time_of_day=TimeOfDay.MORNING,
                day_number=1,
                position_in_text=200,
            ),
        ]

        issues = TimelineAnalyzer.analyze_timeline(events)

        assert len(issues) == 1
        assert issues[0].issue_type == IssueType.TIMELINE
        assert "backwards" in issues[0].description.lower()

    def test_no_issue_correct_time_sequence(self):
        """Test no issue with correct time sequence."""
        events = [
            TimelineEvent(
                id="e1",
                chapter_number=1,
                description="Morning task",
                time_of_day=TimeOfDay.MORNING,
                day_number=1,
                position_in_text=100,
            ),
            TimelineEvent(
                id="e2",
                chapter_number=1,
                description="Afternoon task",
                time_of_day=TimeOfDay.AFTERNOON,
                day_number=1,
                position_in_text=200,
            ),
        ]

        issues = TimelineAnalyzer.analyze_timeline(events)

        assert len(issues) == 0

    def test_find_timeline_gaps(self):
        """Test finding timeline gaps."""
        events = [
            TimelineEvent(id="e1", chapter_number=1, description="Start", day_number=1),
            TimelineEvent(id="e2", chapter_number=5, description="After", day_number=20),
        ]

        gaps = TimelineAnalyzer.find_timeline_gaps(events)

        assert len(gaps) >= 1
        assert "19 days" in gaps[0]


class TestWorldRule:
    """Tests for WorldRule."""

    def test_create_world_rule(self):
        """Test creating a world rule."""
        rule = WorldRule(
            id="r1",
            name="Magic Cost",
            category="magic_system",
            description="All spells require energy.",
            established_in_chapter=2,
        )

        assert rule.id == "r1"
        assert rule.name == "Magic Cost"
        assert rule.category == "magic_system"
        assert rule.established_in_chapter == 2

    def test_world_rule_with_exceptions(self):
        """Test world rule with exceptions."""
        rule = WorldRule(
            id="r2",
            name="No Teleportation",
            category="magic_system",
            description="Teleportation is impossible.",
            exceptions=["The ancient portal allows transport."],
        )

        assert len(rule.exceptions) == 1


class TestContinuityService:
    """Tests for ContinuityService."""

    def test_register_character(self):
        """Test registering a character."""
        service = ContinuityService()
        tracker = service.register_character("Alice", ["Ali", "A"])

        assert tracker.name == "Alice"
        assert service.get_character("Alice") == tracker
        assert service.get_character("alice") == tracker  # Case insensitive

    def test_get_character_by_alias(self):
        """Test getting character by alias."""
        service = ContinuityService()
        tracker = service.register_character("Bob", ["Bobby", "B"])

        assert service.get_character("Bobby") == tracker
        assert service.get_character("bobby") == tracker

    def test_get_nonexistent_character(self):
        """Test getting a character that doesn't exist."""
        service = ContinuityService()

        assert service.get_character("Nobody") is None

    def test_add_timeline_event(self):
        """Test adding a timeline event."""
        service = ContinuityService()
        event = service.add_timeline_event(
            chapter_number=1,
            description="The story begins.",
            time_of_day=TimeOfDay.MORNING,
        )

        assert event.chapter_number == 1
        assert len(service.timeline_events) == 1

    def test_add_world_rule(self):
        """Test adding a world rule."""
        service = ContinuityService()
        rule = service.add_world_rule(
            name="Gravity",
            category="physics",
            description="Things fall down.",
        )

        assert rule.name == "Gravity"
        assert len(service.world_rules) == 1

    def test_calculate_overall_score_perfect(self):
        """Test calculating score with no issues."""
        service = ContinuityService()
        score = service.calculate_overall_score([])

        assert score == 1.0

    def test_calculate_overall_score_with_issues(self):
        """Test calculating score with issues."""
        service = ContinuityService()
        issues = [
            ContinuityIssue(
                id="1",
                issue_type=IssueType.CHARACTER,
                severity=IssueSeverity.WARNING,
                chapter_number=1,
                description="Test issue",
            ),
            ContinuityIssue(
                id="2",
                issue_type=IssueType.TIMELINE,
                severity=IssueSeverity.ERROR,
                chapter_number=2,
                description="Another issue",
            ),
        ]

        score = service.calculate_overall_score(issues)

        assert 0 < score < 1

    def test_generate_summary_no_issues(self):
        """Test generating summary with no issues."""
        service = ContinuityService()
        summary = service.generate_summary([], 1.0)

        assert "No continuity issues" in summary

    def test_generate_summary_with_issues(self):
        """Test generating summary with issues."""
        service = ContinuityService()
        issues = [
            ContinuityIssue(
                id="1",
                issue_type=IssueType.CHARACTER,
                severity=IssueSeverity.ERROR,
                chapter_number=1,
                description="Character issue",
            ),
        ]

        summary = service.generate_summary(issues, 0.5)

        assert "1 continuity issue" in summary
        assert "critical" in summary.lower() or "error" in summary.lower()

    def test_run_full_check(self):
        """Test running a full continuity check."""
        service = ContinuityService()
        tracker = service.register_character("Hero")
        tracker.set_location(1, "Village")
        tracker.set_location(2, "Castle")

        chapters = {
            1: "The Hero was in the Village.",
            2: "The Hero stood in the Castle.",
        }

        result = service.run_full_check(chapters)

        assert result.overall_score <= 1.0
        assert result.overall_score >= 0.0
        assert result.summary != ""

    def test_run_selective_check(self):
        """Test running selective checks."""
        service = ContinuityService()

        chapters = {1: "Chapter 1 content.", 2: "Chapter 2 content."}

        # Only check character
        result = service.run_full_check(chapters, check_types=["character"])

        assert result.overall_score is not None


class TestCharacterExtractor:
    """Tests for CharacterExtractor."""

    def test_extract_potential_characters(self):
        """Test extracting potential character names."""
        text = "Alice and Bob went to the Castle. They met Carol there."
        characters = CharacterExtractor.extract_potential_characters(text)

        assert "Alice" in characters
        assert "Bob" in characters
        assert "Castle" in characters
        assert "Carol" in characters

    def test_exclude_common_words(self):
        """Test excluding common words from character names."""
        text = "The Monday after Christmas, he went home."
        characters = CharacterExtractor.extract_potential_characters(text)

        assert "Monday" not in characters
        assert "Christmas" in characters  # Holiday names might be included

    def test_count_mentions(self):
        """Test counting character mentions."""
        text = "Alice saw Alice in the mirror. Alice was surprised."
        count = CharacterExtractor.count_mentions(text, "Alice")

        assert count == 3

    def test_find_main_characters(self):
        """Test finding main characters by mention frequency."""
        chapters = {
            1: "Alice went to the store. Bob stayed home. Alice bought milk.",
            2: "Alice and Bob had dinner. Alice cooked. Bob cleaned.",
            3: "Alice slept. Bob worked. Alice dreamed.",
        }

        main_chars = CharacterExtractor.find_main_characters(chapters, min_mentions=3)

        assert "Alice" in main_chars
        assert "Bob" in main_chars
        # Alice should be first (more mentions)
        assert main_chars.index("Alice") < main_chars.index("Bob")


class TestContinuityIssue:
    """Tests for ContinuityIssue dataclass."""

    def test_create_continuity_issue(self):
        """Test creating a continuity issue."""
        issue = ContinuityIssue(
            id="issue-1",
            issue_type=IssueType.CHARACTER,
            severity=IssueSeverity.WARNING,
            chapter_number=3,
            description="Eye color changed.",
            original_text="blue eyes",
            suggested_fix="green eyes",
            affected_chapters=[1, 3],
            related_character="Alice",
            auto_fixable=True,
        )

        assert issue.id == "issue-1"
        assert issue.issue_type == IssueType.CHARACTER
        assert issue.severity == IssueSeverity.WARNING
        assert issue.auto_fixable is True

    def test_issue_defaults(self):
        """Test continuity issue defaults."""
        issue = ContinuityIssue(
            id="issue-2",
            issue_type=IssueType.TIMELINE,
            severity=IssueSeverity.INFO,
            chapter_number=1,
            description="Minor timeline note.",
        )

        assert issue.context == ""
        assert issue.original_text is None
        assert issue.affected_chapters == []
        assert issue.auto_fixable is False


class TestIssueTypeAndSeverity:
    """Tests for enums."""

    def test_issue_types(self):
        """Test all issue types exist."""
        assert IssueType.CHARACTER == "character"
        assert IssueType.TIMELINE == "timeline"
        assert IssueType.WORLD == "world"
        assert IssueType.PLOT_HOLE == "plot_hole"
        assert IssueType.INCONSISTENCY == "inconsistency"

    def test_severity_levels(self):
        """Test all severity levels exist."""
        assert IssueSeverity.INFO == "info"
        assert IssueSeverity.WARNING == "warning"
        assert IssueSeverity.ERROR == "error"

    def test_time_of_day(self):
        """Test all time of day values."""
        assert TimeOfDay.DAWN == "dawn"
        assert TimeOfDay.MORNING == "morning"
        assert TimeOfDay.NOON == "noon"
        assert TimeOfDay.AFTERNOON == "afternoon"
        assert TimeOfDay.EVENING == "evening"
        assert TimeOfDay.NIGHT == "night"
        assert TimeOfDay.MIDNIGHT == "midnight"


class TestIntegrationScenarios:
    """Integration tests for realistic scenarios."""

    def test_complete_character_tracking(self):
        """Test complete character tracking workflow."""
        service = ContinuityService()

        # Register characters
        hero = service.register_character("Hero", ["The Chosen One"])
        villain = service.register_character("Dark Lord")

        # Add physical descriptions
        hero.add_physical_description(1, "bright blue eyes")
        hero.add_physical_description(5, "determined blue eyes")

        villain.add_physical_description(3, "scarred face")
        villain.add_physical_description(10, "scarred face with glowing red eyes")

        # Track locations
        hero.set_location(1, "Village")
        hero.set_location(3, "Forest")
        hero.set_location(5, "Castle")

        # Track knowledge
        hero.add_knowledge(2, "the prophecy")
        hero.add_knowledge(5, "the villain's weakness")

        # Check consistency
        chapters = {
            1: "The Hero lived in the Village with his bright blue eyes.",
            3: "The Hero traveled through the Forest.",
            5: "The Hero reached the Castle, his determined blue eyes focused.",
        }

        result = service.run_full_check(chapters)

        assert result.overall_score > 0
        assert len(result.characters) == 2

    def test_timeline_consistency_check(self):
        """Test timeline consistency checking."""
        service = ContinuityService()

        # Add events
        service.add_timeline_event(
            chapter_number=1,
            description="Story begins",
            time_of_day=TimeOfDay.MORNING,
            day_number=1,
        )
        service.add_timeline_event(
            chapter_number=1,
            description="Midday event",
            time_of_day=TimeOfDay.NOON,
            day_number=1,
        )
        service.add_timeline_event(
            chapter_number=2,
            description="Next morning",
            time_of_day=TimeOfDay.MORNING,
            day_number=2,
        )

        result = service.run_full_check({}, check_types=["timeline"])

        # Should have no issues with this valid timeline
        timeline_issues = [i for i in result.issues if i.issue_type == IssueType.TIMELINE]
        assert len(timeline_issues) == 0

    def test_world_building_consistency(self):
        """Test world building consistency."""
        service = ContinuityService()

        # Add world rules
        service.add_world_rule(
            name="Magic requires energy",
            category="magic_system",
            description="All spells drain the caster.",
            established_in_chapter=2,
        )
        service.add_world_rule(
            name="No technology",
            category="technology",
            description="Medieval setting with no modern tech.",
            established_in_chapter=1,
        )

        assert len(service.world_rules) == 2

        chapters = {1: "Chapter 1", 2: "Chapter 2", 3: "Chapter 3"}
        result = service.run_full_check(chapters, check_types=["world"])

        assert result.overall_score is not None

    def test_multi_character_scene_tracking(self):
        """Test tracking multiple characters in scenes."""
        service = ContinuityService()

        alice = service.register_character("Alice")
        bob = service.register_character("Bob")

        # Both characters in the same location
        alice.set_location(1, "Library")
        bob.set_location(1, "Library")

        # Different locations later
        alice.set_location(3, "Garden")
        bob.set_location(3, "Kitchen")

        chapters = {
            1: "Alice and Bob met in the Library.",
            3: "Alice walked to the Garden. Bob went to the Kitchen.",
        }

        result = service.run_full_check(chapters)

        assert "Alice" in result.characters or "alice" in result.characters
        assert "Bob" in result.characters or "bob" in result.characters
