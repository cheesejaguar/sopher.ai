"""Tests for thriller-specific features."""

from uuid import uuid4

import pytest

from app.agents.genres.thriller import (
    Antagonist,
    PlotTwist,
    Stakes,
    StakesEscalator,
    StakeType,
    TensionBeat,
    TensionLevel,
    TensionPacer,
    ThrillerService,
    ThrillerStructure,
    ThrillerSubgenre,
    TwistPlanner,
    TwistType,
)

# =============================================================================
# Enum Tests
# =============================================================================


class TestTensionLevel:
    """Tests for TensionLevel enum."""

    def test_all_levels_exist(self):
        """All tension levels should be defined."""
        assert TensionLevel.CALM.value == "calm"
        assert TensionLevel.RISING.value == "rising"
        assert TensionLevel.HIGH.value == "high"
        assert TensionLevel.PEAK.value == "peak"
        assert TensionLevel.RELEASE.value == "release"

    def test_level_count(self):
        """Should have exactly 5 tension levels."""
        assert len(TensionLevel) == 5


class TestThrillerSubgenre:
    """Tests for ThrillerSubgenre enum."""

    def test_all_subgenres_exist(self):
        """All subgenres should be defined."""
        assert ThrillerSubgenre.PSYCHOLOGICAL.value == "psychological"
        assert ThrillerSubgenre.POLITICAL.value == "political"
        assert ThrillerSubgenre.LEGAL.value == "legal"
        assert ThrillerSubgenre.MEDICAL.value == "medical"
        assert ThrillerSubgenre.TECHNO.value == "techno"
        assert ThrillerSubgenre.SPY.value == "spy"
        assert ThrillerSubgenre.CRIME.value == "crime"
        assert ThrillerSubgenre.ACTION.value == "action"
        assert ThrillerSubgenre.DOMESTIC.value == "domestic"
        assert ThrillerSubgenre.SUPERNATURAL.value == "supernatural"

    def test_subgenre_count(self):
        """Should have exactly 10 subgenres."""
        assert len(ThrillerSubgenre) == 10


class TestTwistType:
    """Tests for TwistType enum."""

    def test_all_twist_types_exist(self):
        """All twist types should be defined."""
        assert TwistType.BETRAYAL.value == "betrayal"
        assert TwistType.IDENTITY.value == "identity"
        assert TwistType.REVELATION.value == "revelation"
        assert TwistType.REVERSAL.value == "reversal"
        assert TwistType.MISDIRECTION.value == "misdirection"
        assert TwistType.DEAD_CHARACTER.value == "dead_character"
        assert TwistType.TRUE_VILLAIN.value == "true_villain"
        assert TwistType.UNRELIABLE.value == "unreliable"
        assert TwistType.TIME.value == "time"
        assert TwistType.REDEMPTION.value == "redemption"

    def test_twist_type_count(self):
        """Should have exactly 10 twist types."""
        assert len(TwistType) == 10


class TestStakeType:
    """Tests for StakeType enum."""

    def test_all_stake_types_exist(self):
        """All stake types should be defined."""
        assert StakeType.PERSONAL.value == "personal"
        assert StakeType.LOVED_ONES.value == "loved_ones"
        assert StakeType.CAREER.value == "career"
        assert StakeType.FREEDOM.value == "freedom"
        assert StakeType.REPUTATION.value == "reputation"
        assert StakeType.LOCAL.value == "local"
        assert StakeType.NATIONAL.value == "national"
        assert StakeType.GLOBAL.value == "global"
        assert StakeType.MORAL.value == "moral"
        assert StakeType.SANITY.value == "sanity"

    def test_stake_type_count(self):
        """Should have exactly 10 stake types."""
        assert len(StakeType) == 10


# =============================================================================
# Dataclass Tests
# =============================================================================


class TestTensionBeat:
    """Tests for TensionBeat dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        beat = TensionBeat()
        assert beat.chapter == 0
        assert beat.level == TensionLevel.RISING
        assert beat.description == ""
        assert beat.source == ""
        assert beat.release_method == ""

    def test_custom_values(self):
        """Should accept custom values."""
        beat = TensionBeat(
            chapter=5,
            level=TensionLevel.PEAK,
            description="Climax confrontation",
            source="Final showdown",
            release_method="Victory",
        )
        assert beat.chapter == 5
        assert beat.level == TensionLevel.PEAK
        assert beat.description == "Climax confrontation"
        assert beat.source == "Final showdown"
        assert beat.release_method == "Victory"


class TestPlotTwist:
    """Tests for PlotTwist dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        twist = PlotTwist()
        assert twist.id is not None
        assert twist.name == ""
        assert twist.twist_type == TwistType.REVELATION
        assert twist.chapter_revealed == 0
        assert twist.setup_chapters == []
        assert twist.description == ""
        assert twist.impact == ""
        assert twist.foreshadowing == []

    def test_custom_values(self):
        """Should accept custom values."""
        twist = PlotTwist(
            name="The Butler Did It",
            twist_type=TwistType.TRUE_VILLAIN,
            chapter_revealed=15,
            setup_chapters=[3, 7, 11],
            description="The butler is the mastermind",
            impact="Changes everything",
            foreshadowing=["Clue 1", "Clue 2"],
        )
        assert twist.name == "The Butler Did It"
        assert twist.twist_type == TwistType.TRUE_VILLAIN
        assert twist.chapter_revealed == 15
        assert twist.setup_chapters == [3, 7, 11]
        assert twist.foreshadowing == ["Clue 1", "Clue 2"]


class TestStakes:
    """Tests for Stakes dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        stakes = Stakes()
        assert stakes.id is not None
        assert stakes.stake_type == StakeType.PERSONAL
        assert stakes.description == ""
        assert stakes.escalation_level == 1
        assert stakes.who_at_risk == []
        assert stakes.deadline == ""
        assert stakes.consequences == ""

    def test_custom_values(self):
        """Should accept custom values."""
        stakes = Stakes(
            stake_type=StakeType.NATIONAL,
            description="The president's life",
            escalation_level=8,
            who_at_risk=["President", "First Family"],
            deadline="48 hours",
            consequences="War",
        )
        assert stakes.stake_type == StakeType.NATIONAL
        assert stakes.escalation_level == 8
        assert stakes.who_at_risk == ["President", "First Family"]
        assert stakes.deadline == "48 hours"


class TestAntagonist:
    """Tests for Antagonist dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        antagonist = Antagonist()
        assert antagonist.id is not None
        assert antagonist.name == ""
        assert antagonist.motivation == ""
        assert antagonist.resources == []
        assert antagonist.methods == []
        assert antagonist.weakness == ""
        assert antagonist.threat_level == 5
        assert antagonist.intelligence == 5
        assert antagonist.ruthlessness == 5
        assert antagonist.is_known is True

    def test_custom_values(self):
        """Should accept custom values."""
        antagonist = Antagonist(
            name="Dr. Evil",
            motivation="World domination",
            resources=["Money", "Henchmen"],
            methods=["Blackmail", "Assassination"],
            weakness="Hubris",
            threat_level=9,
            intelligence=8,
            ruthlessness=10,
            is_known=False,
        )
        assert antagonist.name == "Dr. Evil"
        assert antagonist.threat_level == 9
        assert antagonist.is_known is False


class TestThrillerStructure:
    """Tests for ThrillerStructure dataclass."""

    def test_default_values(self):
        """Should have correct defaults."""
        structure = ThrillerStructure()
        assert structure.id is not None
        assert structure.subgenre == ThrillerSubgenre.PSYCHOLOGICAL
        assert structure.protagonist_name == ""
        assert structure.antagonist is None
        assert structure.stakes == []
        assert structure.twists == []
        assert structure.tension_beats == []
        assert structure.ticking_clock == ""
        assert structure.red_herrings == []

    def test_custom_values(self):
        """Should accept custom values."""
        antagonist = Antagonist(name="Villain")
        structure = ThrillerStructure(
            subgenre=ThrillerSubgenre.SPY,
            protagonist_name="James",
            antagonist=antagonist,
            ticking_clock="Nuclear launch in 24 hours",
            red_herrings=["The ambassador", "The secretary"],
        )
        assert structure.subgenre == ThrillerSubgenre.SPY
        assert structure.protagonist_name == "James"
        assert structure.antagonist.name == "Villain"
        assert "ambassador" in structure.red_herrings[0]


# =============================================================================
# TensionPacer Tests
# =============================================================================


class TestTensionPacer:
    """Tests for TensionPacer class."""

    @pytest.fixture
    def pacer(self):
        """Create a TensionPacer instance."""
        return TensionPacer()

    def test_tension_curve_exists(self, pacer):
        """Tension curve should be defined."""
        assert len(pacer.TENSION_CURVE) > 0
        assert 0.0 in pacer.TENSION_CURVE
        assert 1.0 in pacer.TENSION_CURVE

    def test_get_target_tension_start(self, pacer):
        """Beginning should be calm."""
        assert pacer.get_target_tension(0.0) == TensionLevel.CALM

    def test_get_target_tension_middle(self, pacer):
        """Middle should have varied tension."""
        # Around 50% should be release (breather)
        assert pacer.get_target_tension(0.50) == TensionLevel.RELEASE

    def test_get_target_tension_climax(self, pacer):
        """Climax should be peak tension."""
        assert pacer.get_target_tension(0.90) == TensionLevel.PEAK

    def test_get_target_tension_end(self, pacer):
        """End should return to calm."""
        assert pacer.get_target_tension(1.0) == TensionLevel.CALM

    def test_get_tension_for_chapter(self, pacer):
        """Should calculate tension for specific chapters."""
        # First chapter of 20 = position 0.05
        tension = pacer.get_tension_for_chapter(1, 20)
        assert isinstance(tension, TensionLevel)

    def test_plan_tension_beats(self, pacer):
        """Should plan beats for all chapters."""
        beats = pacer.plan_tension_beats(10)
        assert len(beats) == 10
        assert all(isinstance(b, TensionBeat) for b in beats.values())
        assert beats[1].chapter == 1
        assert beats[10].chapter == 10

    def test_suggest_release_points(self, pacer):
        """Should suggest chapters for tension release."""
        releases = pacer.suggest_release_points(20)
        assert isinstance(releases, list)
        # Should have at least one release point
        for r in releases:
            position = r / 20
            assert pacer.get_target_tension(position) == TensionLevel.RELEASE

    def test_generate_pacing_prompt_calm(self, pacer):
        """Should generate calm pacing prompt."""
        prompt = pacer.generate_pacing_prompt(1, 20)  # Very beginning
        assert "calm" in prompt.lower()
        assert "breathe" in prompt.lower() or "setup" in prompt.lower()

    def test_generate_pacing_prompt_peak(self, pacer):
        """Should generate peak pacing prompt."""
        prompt = pacer.generate_pacing_prompt(18, 20)  # Near climax
        assert "peak" in prompt.lower()
        assert "crisis" in prompt.lower() or "urgent" in prompt.lower()

    def test_generate_pacing_prompt_rising(self, pacer):
        """Should generate rising tension prompt."""
        prompt = pacer.generate_pacing_prompt(2, 20)  # Early rising
        assert "rising" in prompt.lower()


# =============================================================================
# TwistPlanner Tests
# =============================================================================


class TestTwistPlanner:
    """Tests for TwistPlanner class."""

    @pytest.fixture
    def planner(self):
        """Create a TwistPlanner instance."""
        return TwistPlanner()

    def test_add_twist(self, planner):
        """Should add a twist."""
        twist = planner.add_twist(
            name="Secret Identity",
            twist_type=TwistType.IDENTITY,
            chapter_revealed=12,
            description="Hero is the villain's son",
        )
        assert twist.name == "Secret Identity"
        assert twist.twist_type == TwistType.IDENTITY
        assert twist.chapter_revealed == 12

    def test_get_twist(self, planner):
        """Should retrieve a twist by ID."""
        twist = planner.add_twist("Test", TwistType.BETRAYAL, 10)
        retrieved = planner.get_twist(twist.id)
        assert retrieved == twist

    def test_get_nonexistent_twist(self, planner):
        """Should return None for nonexistent twist."""
        assert planner.get_twist(uuid4()) is None

    def test_list_twists(self, planner):
        """Should list all twists."""
        planner.add_twist("Twist 1", TwistType.BETRAYAL, 5)
        planner.add_twist("Twist 2", TwistType.REVERSAL, 15)
        twists = planner.list_twists()
        assert len(twists) == 2
        assert twists[0].name == "Twist 1"
        assert twists[1].name == "Twist 2"

    def test_plan_setup_chapters_early_reveal(self, planner):
        """Should handle early reveals."""
        twist = PlotTwist(chapter_revealed=2)
        chapters = planner.plan_setup_chapters(twist, 20)
        assert 1 in chapters

    def test_plan_setup_chapters_late_reveal(self, planner):
        """Should plan multiple setup chapters for late reveals."""
        twist = PlotTwist(chapter_revealed=15)
        chapters = planner.plan_setup_chapters(twist, 20)
        assert len(chapters) >= 3
        assert all(c < 15 for c in chapters)

    def test_generate_foreshadowing_betrayal(self, planner):
        """Should generate betrayal foreshadowing."""
        twist = PlotTwist(twist_type=TwistType.BETRAYAL)
        hints = planner.generate_foreshadowing(twist)
        assert len(hints) > 0
        assert any("inconsistenc" in h.lower() for h in hints)

    def test_generate_foreshadowing_identity(self, planner):
        """Should generate identity foreshadowing."""
        twist = PlotTwist(twist_type=TwistType.IDENTITY)
        hints = planner.generate_foreshadowing(twist)
        assert len(hints) > 0
        assert any("physical" in h.lower() or "history" in h.lower() for h in hints)

    def test_generate_foreshadowing_revelation(self, planner):
        """Should generate revelation foreshadowing."""
        twist = PlotTwist(twist_type=TwistType.REVELATION)
        hints = planner.generate_foreshadowing(twist)
        assert len(hints) > 0
        assert any("locked" in h.lower() or "forbidden" in h.lower() for h in hints)

    def test_generate_foreshadowing_unknown_type(self, planner):
        """Should return empty list for unknown twist type."""
        twist = PlotTwist(twist_type=TwistType.TIME)  # No predefined hints
        hints = planner.generate_foreshadowing(twist)
        assert hints == []

    def test_generate_twist_prompt_reveal(self, planner):
        """Should generate reveal chapter prompt."""
        twist = PlotTwist(
            name="The Reveal",
            twist_type=TwistType.TRUE_VILLAIN,
            impact="Changes everything",
        )
        prompt = planner.generate_twist_prompt(twist, is_reveal_chapter=True)
        assert "TWIST REVEAL" in prompt
        assert "The Reveal" in prompt
        assert "true_villain" in prompt
        assert "Changes everything" in prompt

    def test_generate_twist_prompt_setup(self, planner):
        """Should generate setup chapter prompt."""
        twist = PlotTwist(
            name="The Betrayal",
            twist_type=TwistType.BETRAYAL,
        )
        prompt = planner.generate_twist_prompt(twist, is_reveal_chapter=False)
        assert "foreshadowing" in prompt.lower()
        assert "The Betrayal" in prompt


# =============================================================================
# StakesEscalator Tests
# =============================================================================


class TestStakesEscalator:
    """Tests for StakesEscalator class."""

    @pytest.fixture
    def escalator(self):
        """Create a StakesEscalator instance."""
        return StakesEscalator()

    def test_escalation_pattern_exists(self, escalator):
        """Escalation pattern should be defined."""
        assert len(escalator.ESCALATION_PATTERN) > 0
        assert 0.0 in escalator.ESCALATION_PATTERN

    def test_add_stakes(self, escalator):
        """Should add stakes."""
        stakes = escalator.add_stakes(
            stake_type=StakeType.LOVED_ONES,
            description="Family kidnapped",
            escalation_level=6,
        )
        assert stakes.stake_type == StakeType.LOVED_ONES
        assert stakes.description == "Family kidnapped"
        assert stakes.escalation_level == 6

    def test_get_stakes(self, escalator):
        """Should retrieve stakes by ID."""
        stakes = escalator.add_stakes(StakeType.PERSONAL, "Test")
        retrieved = escalator.get_stakes(stakes.id)
        assert retrieved == stakes

    def test_get_nonexistent_stakes(self, escalator):
        """Should return None for nonexistent stakes."""
        assert escalator.get_stakes(uuid4()) is None

    def test_list_stakes(self, escalator):
        """Should list all stakes."""
        escalator.add_stakes(StakeType.PERSONAL, "Stakes 1")
        escalator.add_stakes(StakeType.NATIONAL, "Stakes 2")
        stakes = escalator.list_stakes()
        assert len(stakes) == 2

    def test_get_target_escalation_start(self, escalator):
        """Beginning should have low escalation."""
        assert escalator.get_target_escalation(0.0) == 1

    def test_get_target_escalation_end(self, escalator):
        """End should have high escalation."""
        assert escalator.get_target_escalation(0.95) == 9

    def test_get_target_escalation_middle(self, escalator):
        """Middle should have medium escalation."""
        assert 4 <= escalator.get_target_escalation(0.40) <= 5

    def test_plan_escalation(self, escalator):
        """Should plan escalation for all chapters."""
        escalation = escalator.plan_escalation(20)
        assert len(escalation) == 20
        # Escalation should generally increase
        assert escalation[1] < escalation[20]

    def test_suggest_stake_progression(self, escalator):
        """Should suggest stake type progression."""
        progression = escalator.suggest_stake_progression()
        assert len(progression) > 0
        assert StakeType.PERSONAL in progression
        # Personal should be early
        assert progression.index(StakeType.PERSONAL) < progression.index(StakeType.NATIONAL)

    def test_generate_stakes_prompt_no_stakes(self, escalator):
        """Should generate establishment prompt when no stakes."""
        prompt = escalator.generate_stakes_prompt(1, 20, None)
        assert "Establish Stakes" in prompt

    def test_generate_stakes_prompt_with_stakes(self, escalator):
        """Should show current stakes when present."""
        stakes = Stakes(
            stake_type=StakeType.PERSONAL,
            description="Hero's life",
            escalation_level=5,
            who_at_risk=["Hero"],
        )
        prompt = escalator.generate_stakes_prompt(10, 20, stakes)
        assert "Current Stakes" in prompt or "Stakes Escalation" in prompt
        assert "Hero's life" in prompt

    def test_generate_stakes_prompt_escalation_needed(self, escalator):
        """Should suggest escalation when level is too low."""
        stakes = Stakes(
            stake_type=StakeType.PERSONAL,
            description="Minor threat",
            escalation_level=1,
        )
        # Late in story, escalation level 1 is too low
        prompt = escalator.generate_stakes_prompt(18, 20, stakes)
        assert "Escalation Needed" in prompt


# =============================================================================
# ThrillerService Tests
# =============================================================================


class TestThrillerService:
    """Tests for ThrillerService class."""

    @pytest.fixture
    def service(self):
        """Create a ThrillerService instance."""
        return ThrillerService()

    def test_create_structure(self, service):
        """Should create a thriller structure."""
        structure = service.create_structure(
            subgenre=ThrillerSubgenre.SPY,
            protagonist_name="James",
            ticking_clock="Bomb detonates at midnight",
        )
        assert structure.subgenre == ThrillerSubgenre.SPY
        assert structure.protagonist_name == "James"
        assert structure.ticking_clock == "Bomb detonates at midnight"

    def test_get_structure(self, service):
        """Should retrieve a structure by ID."""
        structure = service.create_structure()
        retrieved = service.get_structure(structure.id)
        assert retrieved == structure

    def test_get_nonexistent_structure(self, service):
        """Should return None for nonexistent structure."""
        assert service.get_structure(uuid4()) is None

    def test_set_antagonist(self, service):
        """Should set antagonist for structure."""
        structure = service.create_structure()
        antagonist = service.set_antagonist(
            structure.id,
            name="Dr. Evil",
            motivation="World domination",
            threat_level=9,
        )
        assert antagonist.name == "Dr. Evil"
        assert structure.antagonist == antagonist

    def test_set_antagonist_invalid_structure(self, service):
        """Should return None for invalid structure."""
        assert service.set_antagonist(uuid4(), "Name", "Motivation") is None

    def test_add_twist(self, service):
        """Should add twist to structure."""
        structure = service.create_structure()
        twist = service.add_twist(
            structure.id,
            name="Secret Identity",
            twist_type=TwistType.IDENTITY,
            chapter_revealed=12,
        )
        assert twist.name == "Secret Identity"
        assert twist in structure.twists

    def test_add_twist_invalid_structure(self, service):
        """Should return None for invalid structure."""
        assert service.add_twist(uuid4(), "Name", TwistType.BETRAYAL, 5) is None

    def test_add_stakes(self, service):
        """Should add stakes to structure."""
        structure = service.create_structure()
        stakes = service.add_stakes(
            structure.id,
            stake_type=StakeType.NATIONAL,
            description="Government secrets",
        )
        assert stakes.stake_type == StakeType.NATIONAL
        assert stakes in structure.stakes

    def test_add_stakes_invalid_structure(self, service):
        """Should return None for invalid structure."""
        assert service.add_stakes(uuid4(), StakeType.PERSONAL, "Test") is None

    def test_get_tension_for_chapter(self, service):
        """Should delegate to pacer."""
        tension = service.get_tension_for_chapter(1, 20)
        assert isinstance(tension, TensionLevel)

    def test_get_escalation_for_chapter(self, service):
        """Should delegate to escalator."""
        escalation = service.get_escalation_for_chapter(18, 20)
        assert isinstance(escalation, int)
        assert escalation > 5  # Late in story should be high

    def test_generate_chapter_prompt_empty_structure(self, service):
        """Should return empty for invalid structure."""
        assert service.generate_chapter_prompt(uuid4(), 1, 20) == ""

    def test_generate_chapter_prompt_basic(self, service):
        """Should generate prompt with subgenre and pacing."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.SPY)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "spy" in prompt.lower()
        assert "Pacing" in prompt

    def test_generate_chapter_prompt_with_antagonist(self, service):
        """Should include antagonist pressure."""
        structure = service.create_structure()
        service.set_antagonist(structure.id, "Villain", "Power", threat_level=8)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "Villain" in prompt
        assert "8/10" in prompt

    def test_generate_chapter_prompt_with_stakes(self, service):
        """Should include stakes information."""
        structure = service.create_structure()
        service.add_stakes(structure.id, StakeType.LOVED_ONES, "Family at risk")
        prompt = service.generate_chapter_prompt(structure.id, 10, 20)
        assert "Family at risk" in prompt

    def test_generate_chapter_prompt_with_twist_reveal(self, service):
        """Should include twist reveal for correct chapter."""
        structure = service.create_structure()
        service.add_twist(structure.id, "Big Reveal", TwistType.BETRAYAL, chapter_revealed=10)
        prompt = service.generate_chapter_prompt(structure.id, 10, 20)
        assert "TWIST REVEAL" in prompt
        assert "Big Reveal" in prompt

    def test_generate_chapter_prompt_with_twist_setup(self, service):
        """Should include foreshadowing for setup chapters."""
        structure = service.create_structure()
        twist = service.add_twist(
            structure.id, "Late Reveal", TwistType.BETRAYAL, chapter_revealed=15
        )
        # Get a setup chapter
        setup_chapters = service.twist_planner.plan_setup_chapters(twist, 20)
        if setup_chapters:
            prompt = service.generate_chapter_prompt(structure.id, setup_chapters[0], 20)
            assert "foreshadowing" in prompt.lower()

    def test_generate_chapter_prompt_with_ticking_clock(self, service):
        """Should include ticking clock reminder in second half."""
        structure = service.create_structure(ticking_clock="Bomb at midnight")
        # First half - no reminder
        prompt_early = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "Ticking Clock" not in prompt_early

        # Second half - should remind
        prompt_late = service.generate_chapter_prompt(structure.id, 15, 20)
        assert "Ticking Clock" in prompt_late
        assert "Bomb at midnight" in prompt_late

    def test_plan_tension_curve(self, service):
        """Should plan tension curve for all chapters."""
        curve = service.plan_tension_curve(20)
        assert len(curve) == 20
        assert all(isinstance(v, TensionLevel) for v in curve.values())

    def test_get_twist_foreshadowing(self, service):
        """Should get foreshadowing for a twist."""
        twist = PlotTwist(twist_type=TwistType.REVELATION)
        hints = service.get_twist_foreshadowing(twist)
        assert len(hints) > 0

    def test_validate_structure_empty(self, service):
        """Should find issues in empty structure."""
        structure = service.create_structure()
        issues = service.validate_structure(structure.id)
        assert "No antagonist defined" in issues
        assert "No stakes defined" in issues

    def test_validate_structure_no_motivation(self, service):
        """Should flag antagonist without motivation."""
        structure = service.create_structure()
        service.set_antagonist(structure.id, "Villain", "")
        issues = service.validate_structure(structure.id)
        assert "Antagonist needs a clear motivation" in issues

    def test_validate_structure_complete(self, service):
        """Complete structure should have fewer issues."""
        structure = service.create_structure(ticking_clock="24 hours")
        service.set_antagonist(structure.id, "Villain", "Revenge")
        service.add_stakes(structure.id, StakeType.PERSONAL, "Life")
        service.add_twist(structure.id, "Twist", TwistType.BETRAYAL, 10)
        issues = service.validate_structure(structure.id)
        assert len(issues) == 0

    def test_validate_invalid_structure(self, service):
        """Should return error for invalid structure."""
        issues = service.validate_structure(uuid4())
        assert "Structure not found" in issues


class TestSubgenreGuidance:
    """Tests for subgenre guidance in ThrillerService."""

    @pytest.fixture
    def service(self):
        """Create a ThrillerService instance."""
        return ThrillerService()

    def test_psychological_guidance(self, service):
        """Should provide psychological thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.PSYCHOLOGICAL)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "psychological" in prompt.lower()
        assert "mental" in prompt.lower() or "manipulation" in prompt.lower()

    def test_political_guidance(self, service):
        """Should provide political thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.POLITICAL)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "political" in prompt.lower()
        assert "conspiracy" in prompt.lower() or "government" in prompt.lower()

    def test_legal_guidance(self, service):
        """Should provide legal thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.LEGAL)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "legal" in prompt.lower()
        assert "courtroom" in prompt.lower() or "evidence" in prompt.lower()

    def test_spy_guidance(self, service):
        """Should provide spy thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.SPY)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "spy" in prompt.lower()
        assert "espionage" in prompt.lower() or "agent" in prompt.lower()

    def test_action_guidance(self, service):
        """Should provide action thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.ACTION)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "action" in prompt.lower()
        assert "physical" in prompt.lower() or "chase" in prompt.lower()

    def test_domestic_guidance(self, service):
        """Should provide domestic thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.DOMESTIC)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "domestic" in prompt.lower()
        assert "home" in prompt.lower() or "familiar" in prompt.lower()

    def test_techno_guidance(self, service):
        """Should provide techno thriller guidance."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.TECHNO)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        assert "techno" in prompt.lower()
        assert "technology" in prompt.lower() or "cyber" in prompt.lower()

    def test_subgenre_without_guidance(self, service):
        """Subgenres without specific guidance should still work."""
        structure = service.create_structure(subgenre=ThrillerSubgenre.MEDICAL)
        prompt = service.generate_chapter_prompt(structure.id, 5, 20)
        # Should still have pacing guidance
        assert "Pacing" in prompt
