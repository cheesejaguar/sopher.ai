"""Tests for mystery-specific features."""

from uuid import uuid4

from app.agents.genres.mystery import (
    Clue,
    ClueImportance,
    CluePlacementManager,
    ClueType,
    FairPlayValidator,
    MysteryService,
    MysteryStructure,
    MysterySubgenre,
    RedHerring,
    RedHerringGenerator,
    RedHerringType,
    Suspect,
    SuspectManager,
    SuspectRole,
)


class TestEnums:
    """Tests for enum classes."""

    def test_clue_type_values(self):
        """Test ClueType enum values."""
        assert ClueType.PHYSICAL.value == "physical"
        assert ClueType.TESTIMONIAL.value == "testimonial"
        assert ClueType.FORENSIC.value == "forensic"

    def test_clue_importance_values(self):
        """Test ClueImportance enum values."""
        assert ClueImportance.CRITICAL.value == "critical"
        assert ClueImportance.MINOR.value == "minor"

    def test_red_herring_type_values(self):
        """Test RedHerringType enum values."""
        assert RedHerringType.FALSE_SUSPECT.value == "false_suspect"
        assert RedHerringType.MISLEADING_CLUE.value == "misleading_clue"

    def test_suspect_role_values(self):
        """Test SuspectRole enum values."""
        assert SuspectRole.CULPRIT.value == "culprit"
        assert SuspectRole.RED_HERRING.value == "red_herring"
        assert SuspectRole.SLEUTH.value == "sleuth"

    def test_mystery_subgenre_values(self):
        """Test MysterySubgenre enum values."""
        assert MysterySubgenre.COZY.value == "cozy"
        assert MysterySubgenre.HARDBOILED.value == "hardboiled"
        assert MysterySubgenre.LOCKED_ROOM.value == "locked_room"


class TestDataclasses:
    """Tests for dataclasses."""

    def test_clue_defaults(self):
        """Test Clue default values."""
        clue = Clue()
        assert clue.name == ""
        assert clue.clue_type == ClueType.PHYSICAL
        assert clue.importance == ClueImportance.MINOR
        assert clue.is_revealed is False

    def test_clue_custom(self):
        """Test Clue with custom values."""
        clue = Clue(
            name="Bloody Knife",
            description="A knife with blood on the blade",
            clue_type=ClueType.PHYSICAL,
            importance=ClueImportance.CRITICAL,
            chapter_introduced=3,
        )
        assert clue.name == "Bloody Knife"
        assert clue.importance == ClueImportance.CRITICAL

    def test_red_herring_defaults(self):
        """Test RedHerring default values."""
        herring = RedHerring()
        assert herring.name == ""
        assert herring.herring_type == RedHerringType.MISLEADING_CLUE

    def test_suspect_defaults(self):
        """Test Suspect default values."""
        suspect = Suspect()
        assert suspect.name == ""
        assert suspect.role == SuspectRole.RED_HERRING
        assert suspect.alibi_strength == 0.5

    def test_mystery_structure_defaults(self):
        """Test MysteryStructure default values."""
        structure = MysteryStructure()
        assert structure.crime_type == "murder"
        assert structure.subgenre == MysterySubgenre.WHODUNIT
        assert structure.clues == []


class TestCluePlacementManager:
    """Tests for CluePlacementManager."""

    def test_add_clue(self):
        """Test adding a clue."""
        manager = CluePlacementManager()
        clue = manager.add_clue(
            name="Fingerprint",
            description="A partial fingerprint on the doorknob",
            clue_type=ClueType.FORENSIC,
            importance=ClueImportance.MAJOR,
        )

        assert clue.name == "Fingerprint"
        assert clue.clue_type == ClueType.FORENSIC

    def test_get_clue(self):
        """Test getting a clue."""
        manager = CluePlacementManager()
        created = manager.add_clue("Test Clue", "Description")
        retrieved = manager.get_clue(created.id)

        assert retrieved is not None
        assert retrieved.name == "Test Clue"

    def test_list_clues(self):
        """Test listing clues."""
        manager = CluePlacementManager()
        manager.add_clue("Clue 1", "Desc 1")
        manager.add_clue("Clue 2", "Desc 2")

        clues = manager.list_clues()
        assert len(clues) == 2

    def test_get_clues_by_chapter(self):
        """Test getting clues by chapter."""
        manager = CluePlacementManager()
        manager.add_clue("Clue 1", "Desc", chapter_introduced=1)
        manager.add_clue("Clue 2", "Desc", chapter_introduced=1)
        manager.add_clue("Clue 3", "Desc", chapter_introduced=3)

        ch1_clues = manager.get_clues_by_chapter(1)
        assert len(ch1_clues) == 2

    def test_get_unrevealed_clues(self):
        """Test getting unrevealed clues."""
        manager = CluePlacementManager()
        clue1 = manager.add_clue("Revealed", "Desc")
        manager.add_clue("Unrevealed", "Desc")

        manager.mark_revealed(clue1.id, 5)

        unrevealed = manager.get_unrevealed_clues()
        assert len(unrevealed) == 1
        assert unrevealed[0].name == "Unrevealed"

    def test_get_critical_clues(self):
        """Test getting critical clues."""
        manager = CluePlacementManager()
        manager.add_clue("Critical", "Desc", importance=ClueImportance.CRITICAL)
        manager.add_clue("Minor", "Desc", importance=ClueImportance.MINOR)

        critical = manager.get_critical_clues()
        assert len(critical) == 1
        assert critical[0].name == "Critical"

    def test_mark_revealed(self):
        """Test marking clue as revealed."""
        manager = CluePlacementManager()
        clue = manager.add_clue("Test", "Desc")

        result = manager.mark_revealed(clue.id, 10)
        assert result is True

        retrieved = manager.get_clue(clue.id)
        assert retrieved.is_revealed is True
        assert retrieved.chapter_significance_revealed == 10

    def test_plan_clue_distribution_short(self):
        """Test clue distribution for short story."""
        manager = CluePlacementManager()
        distribution = manager.plan_clue_distribution(total_chapters=4)

        assert 1 in distribution
        assert ClueImportance.CRITICAL in distribution[1]

    def test_plan_clue_distribution_novel(self):
        """Test clue distribution for novel."""
        manager = CluePlacementManager()
        distribution = manager.plan_clue_distribution(total_chapters=20)

        # Should have critical clues distributed
        all_clues = []
        for clues in distribution.values():
            all_clues.extend(clues)
        critical_count = sum(1 for c in all_clues if c == ClueImportance.CRITICAL)
        assert critical_count >= 3

    def test_generate_clue_prompt(self):
        """Test generating clue prompt."""
        manager = CluePlacementManager()
        clue1 = manager.add_clue(
            "Evidence A",
            "Important evidence",
            importance=ClueImportance.CRITICAL,
            location="Library",
        )
        clue2 = manager.add_clue(
            "Evidence B",
            "Minor evidence",
            importance=ClueImportance.MINOR,
        )

        prompt = manager.generate_clue_prompt(1, [clue1, clue2])

        assert "Evidence A" in prompt
        assert "Library" in prompt
        assert "IMPORTANT" in prompt


class TestRedHerringGenerator:
    """Tests for RedHerringGenerator."""

    def test_add_herring(self):
        """Test adding a red herring."""
        generator = RedHerringGenerator()
        herring = generator.add_herring(
            name="Suspicious Letter",
            description="A threatening letter",
            herring_type=RedHerringType.MISLEADING_CLUE,
            false_implication="Points to the butler",
            actual_explanation="Written as a joke",
        )

        assert herring.name == "Suspicious Letter"
        assert herring.actual_explanation == "Written as a joke"

    def test_generate_false_suspect(self):
        """Test generating false suspect herring."""
        generator = RedHerringGenerator()
        herring = generator.generate_false_suspect(
            name="John Smith",
            apparent_motive="Inheritance money",
            actual_innocence="Was in another country",
        )

        assert herring.herring_type == RedHerringType.FALSE_SUSPECT
        assert "John Smith" in herring.name

    def test_generate_misleading_clue(self):
        """Test generating misleading clue herring."""
        generator = RedHerringGenerator()
        herring = generator.generate_misleading_clue(
            clue_name="Muddy Footprints",
            false_meaning="Points to gardener",
            true_meaning="From delivery person",
        )

        assert herring.herring_type == RedHerringType.MISLEADING_CLUE
        assert "gardener" in herring.false_implication

    def test_plan_herring_distribution(self):
        """Test planning herring distribution."""
        generator = RedHerringGenerator()
        distribution = generator.plan_herring_distribution(total_chapters=20)

        assert len(distribution) > 0
        all_types = []
        for types in distribution.values():
            all_types.extend(types)
        assert RedHerringType.FALSE_SUSPECT in all_types

    def test_generate_herring_prompt(self):
        """Test generating herring prompt."""
        generator = RedHerringGenerator()
        herring = generator.add_herring(
            name="Suspicious Timing",
            description="Character seen near crime scene",
            false_implication="Makes them seem guilty",
            actual_explanation="Unrelated errand",
        )

        prompt = generator.generate_herring_prompt(herring)

        assert "Suspicious Timing" in prompt
        assert "false_implication" in prompt.lower() or "false implication" in prompt.lower()


class TestSuspectManager:
    """Tests for SuspectManager."""

    def test_add_suspect(self):
        """Test adding a suspect."""
        manager = SuspectManager()
        suspect = manager.add_suspect(
            name="Colonel Mustard",
            role=SuspectRole.RED_HERRING,
            motive="Jealousy",
            means="Had access to weapon",
        )

        assert suspect.name == "Colonel Mustard"
        assert suspect.motive == "Jealousy"

    def test_get_suspect(self):
        """Test getting suspect by ID."""
        manager = SuspectManager()
        created = manager.add_suspect("Test Suspect")
        retrieved = manager.get_suspect(created.id)

        assert retrieved is not None
        assert retrieved.name == "Test Suspect"

    def test_get_suspect_by_name(self):
        """Test getting suspect by name."""
        manager = SuspectManager()
        manager.add_suspect("Miss Scarlet")

        found = manager.get_suspect_by_name("miss scarlet")
        assert found is not None
        assert found.name == "Miss Scarlet"

    def test_get_culprit(self):
        """Test getting the culprit."""
        manager = SuspectManager()
        manager.add_suspect("Innocent", role=SuspectRole.RED_HERRING)
        manager.add_suspect("Guilty", role=SuspectRole.CULPRIT)

        culprit = manager.get_culprit()
        assert culprit is not None
        assert culprit.name == "Guilty"

    def test_get_red_herrings(self):
        """Test getting red herring suspects."""
        manager = SuspectManager()
        manager.add_suspect("Herring 1", role=SuspectRole.RED_HERRING)
        manager.add_suspect("Herring 2", role=SuspectRole.RED_HERRING)
        manager.add_suspect("Culprit", role=SuspectRole.CULPRIT)

        herrings = manager.get_red_herrings()
        assert len(herrings) == 2

    def test_validate_suspect_pool_valid(self):
        """Test validating a valid suspect pool."""
        manager = SuspectManager()
        manager.add_suspect(
            "The Butler",
            role=SuspectRole.CULPRIT,
            motive="Revenge",
            means="Access to poison",
            opportunity="Was in the kitchen",
        )
        manager.add_suspect("Suspect 2", role=SuspectRole.RED_HERRING)
        manager.add_suspect("Suspect 3", role=SuspectRole.RED_HERRING)

        issues = manager.validate_suspect_pool()
        assert len(issues) == 0

    def test_validate_suspect_pool_no_culprit(self):
        """Test validating pool with no culprit."""
        manager = SuspectManager()
        manager.add_suspect("Suspect 1", role=SuspectRole.RED_HERRING)

        issues = manager.validate_suspect_pool()
        assert any("culprit" in issue.lower() for issue in issues)

    def test_validate_suspect_pool_culprit_missing_mmo(self):
        """Test culprit missing motive/means/opportunity."""
        manager = SuspectManager()
        manager.add_suspect("Culprit", role=SuspectRole.CULPRIT)
        manager.add_suspect("Herring 1", role=SuspectRole.RED_HERRING)
        manager.add_suspect("Herring 2", role=SuspectRole.RED_HERRING)

        issues = manager.validate_suspect_pool()
        assert any("motive" in issue.lower() for issue in issues)
        assert any("means" in issue.lower() for issue in issues)

    def test_generate_suspect_profile(self):
        """Test generating suspect profile."""
        manager = SuspectManager()
        suspect = manager.add_suspect(
            "Prof. Plum",
            role=SuspectRole.RED_HERRING,
            motive="Academic rivalry",
            alibi="Teaching a class",
            alibi_strength=0.8,
            secrets=["Had affair with victim"],
        )

        profile = manager.generate_suspect_profile(suspect)

        assert "Prof. Plum" in profile
        assert "Academic rivalry" in profile
        assert "affair" in profile


class TestFairPlayValidator:
    """Tests for FairPlayValidator."""

    def test_validate_valid_mystery(self):
        """Test validating a valid mystery."""
        structure = MysteryStructure(
            culprit_name="The Butler",
        )
        structure.suspects = [
            Suspect(
                name="The Butler",
                role=SuspectRole.CULPRIT,
                motive="Revenge",
                means="Poison",
                opportunity="Access",
            ),
            Suspect(name="The Maid", role=SuspectRole.RED_HERRING, first_appearance=1),
            Suspect(name="The Cook", role=SuspectRole.RED_HERRING, first_appearance=1),
        ]
        structure.clues = [
            Clue(name="Clue 1", importance=ClueImportance.CRITICAL, points_to="The Butler"),
            Clue(name="Clue 2", importance=ClueImportance.CRITICAL, points_to="The Butler"),
        ]

        validator = FairPlayValidator()
        check = validator.validate(structure)

        assert check.passes is True
        assert len(check.issues) == 0

    def test_validate_no_culprit(self):
        """Test validating mystery with no culprit."""
        structure = MysteryStructure()
        structure.suspects = [
            Suspect(name="Suspect 1", role=SuspectRole.RED_HERRING),
        ]

        validator = FairPlayValidator()
        check = validator.validate(structure)

        assert check.passes is False
        assert any("culprit" in issue.lower() for issue in check.issues)

    def test_validate_culprit_missing_motive(self):
        """Test culprit without motive fails."""
        structure = MysteryStructure()
        structure.suspects = [
            Suspect(name="Culprit", role=SuspectRole.CULPRIT, means="Knife", opportunity="Alone"),
        ]

        validator = FairPlayValidator()
        check = validator.validate(structure)

        assert check.passes is False
        assert any("motive" in issue.lower() for issue in check.issues)

    def test_validate_detective_is_culprit(self):
        """Test detective as culprit fails fair play."""
        structure = MysteryStructure()
        structure.suspects = [
            Suspect(name="Detective", role=SuspectRole.SLEUTH),
            Suspect(
                name="Detective", role=SuspectRole.CULPRIT, motive="M", means="M", opportunity="O"
            ),
        ]

        validator = FairPlayValidator()
        check = validator.validate(structure)

        assert check.passes is False
        assert any("detective" in issue.lower() for issue in check.issues)

    def test_fair_play_rules_exist(self):
        """Test that fair play rules are defined."""
        assert len(FairPlayValidator.FAIR_PLAY_RULES) >= 5


class TestMysteryService:
    """Tests for MysteryService."""

    def test_create_structure(self):
        """Test creating a mystery structure."""
        service = MysteryService()
        structure = service.create_structure(
            crime_type="murder",
            victim_name="Mr. Boddy",
            culprit_name="Colonel Mustard",
            motive="Inheritance",
            subgenre=MysterySubgenre.WHODUNIT,
        )

        assert structure.crime_type == "murder"
        assert structure.victim_name == "Mr. Boddy"

    def test_get_structure(self):
        """Test getting a structure."""
        service = MysteryService()
        created = service.create_structure()
        retrieved = service.get_structure(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id

    def test_add_clue(self):
        """Test adding a clue to structure."""
        service = MysteryService()
        structure = service.create_structure()

        clue = service.add_clue(
            structure.id,
            name="Evidence",
            description="Important evidence",
        )

        assert clue is not None
        assert len(structure.clues) == 1

    def test_add_suspect(self):
        """Test adding a suspect to structure."""
        service = MysteryService()
        structure = service.create_structure()

        suspect = service.add_suspect(
            structure.id,
            name="Suspect",
            role=SuspectRole.RED_HERRING,
        )

        assert suspect is not None
        assert len(structure.suspects) == 1

    def test_add_red_herring(self):
        """Test adding a red herring to structure."""
        service = MysteryService()
        structure = service.create_structure()

        herring = service.add_red_herring(
            structure.id,
            name="False Lead",
            description="A misleading clue",
        )

        assert herring is not None
        assert len(structure.red_herrings) == 1

    def test_validate_fair_play(self):
        """Test fair play validation through service."""
        service = MysteryService()
        structure = service.create_structure()
        service.add_suspect(
            structure.id,
            name="Culprit",
            role=SuspectRole.CULPRIT,
            motive="Greed",
            means="Knife",
            opportunity="Alone",
        )

        check = service.validate_fair_play(structure.id)
        assert check.passes is True

    def test_generate_chapter_prompt(self):
        """Test generating chapter prompt."""
        service = MysteryService()
        structure = service.create_structure(subgenre=MysterySubgenre.COZY)
        service.add_clue(
            structure.id,
            "First Clue",
            "Description",
            chapter_introduced=1,
        )

        prompt = service.generate_chapter_prompt(structure.id, 1, 20)

        assert len(prompt) > 0
        assert "First Clue" in prompt
        assert "cozy" in prompt.lower()

    def test_chapter_prompt_story_phases(self):
        """Test chapter prompt includes story phase."""
        service = MysteryService()
        structure = service.create_structure()

        early = service.generate_chapter_prompt(structure.id, 1, 20)
        middle = service.generate_chapter_prompt(structure.id, 10, 20)
        late = service.generate_chapter_prompt(structure.id, 19, 20)

        assert "Setup" in early
        assert "Investigation" in middle or "Complications" in middle
        assert "Resolution" in late

    def test_get_suspect_profiles(self):
        """Test getting suspect profiles."""
        service = MysteryService()
        structure = service.create_structure()
        service.add_suspect(structure.id, "Suspect A", motive="Revenge")
        service.add_suspect(structure.id, "Suspect B", motive="Money")

        profiles = service.get_suspect_profiles(structure.id)

        assert "Suspect A" in profiles
        assert "Suspect B" in profiles
        assert "Revenge" in profiles

    def test_plan_clue_distribution(self):
        """Test planning clue distribution through service."""
        service = MysteryService()
        structure = service.create_structure()

        distribution = service.plan_clue_distribution(structure.id, 20)
        assert len(distribution) > 0

    def test_plan_herring_distribution(self):
        """Test planning herring distribution through service."""
        service = MysteryService()
        structure = service.create_structure()

        distribution = service.plan_herring_distribution(structure.id, 20)
        assert len(distribution) > 0


class TestIntegration:
    """Integration tests for mystery features."""

    def test_complete_mystery_setup(self):
        """Test setting up a complete mystery."""
        service = MysteryService()

        # Create structure
        structure = service.create_structure(
            crime_type="murder",
            victim_name="Lord Blackwood",
            culprit_name="Lady Grey",
            motive="Inheritance",
            method="Poison in tea",
            subgenre=MysterySubgenre.COZY,
            detective_name="Miss Marple",
        )

        # Add suspects
        service.add_suspect(
            structure.id,
            "Lady Grey",
            role=SuspectRole.CULPRIT,
            motive="Inheritance",
            means="Access to poison",
            opportunity="Served the tea",
            first_appearance=1,
        )
        service.add_suspect(
            structure.id,
            "The Butler",
            role=SuspectRole.RED_HERRING,
            motive="Grudge",
            first_appearance=1,
        )
        service.add_suspect(
            structure.id,
            "Miss Marple",
            role=SuspectRole.SLEUTH,
            first_appearance=2,
        )

        # Add clues
        service.add_clue(
            structure.id,
            "Teacup residue",
            "Strange residue in the victim's teacup",
            importance=ClueImportance.CRITICAL,
            chapter_introduced=3,
            points_to="Lady Grey",
        )
        service.add_clue(
            structure.id,
            "Missing poison bottle",
            "A bottle is missing from the gardener's shed",
            importance=ClueImportance.MAJOR,
            chapter_introduced=4,
            points_to="Lady Grey",
        )

        # Add red herring
        service.add_red_herring(
            structure.id,
            "Butler's secret",
            "The butler was stealing silver",
            herring_type=RedHerringType.FALSE_SUSPECT,
            false_implication="Butler had motive to kill",
            actual_explanation="Unrelated to murder",
            chapter_introduced=5,
        )

        # Validate
        check = service.validate_fair_play(structure.id)
        assert check.passes is True

        # Generate prompts
        ch1_prompt = service.generate_chapter_prompt(structure.id, 1, 15)
        ch5_prompt = service.generate_chapter_prompt(structure.id, 5, 15)

        assert len(ch1_prompt) > 0
        assert "Butler's secret" in ch5_prompt


class TestEdgeCases:
    """Tests for edge cases."""

    def test_get_nonexistent_structure(self):
        """Test getting nonexistent structure."""
        service = MysteryService()
        result = service.get_structure(uuid4())
        assert result is None

    def test_add_clue_nonexistent_structure(self):
        """Test adding clue to nonexistent structure."""
        service = MysteryService()
        result = service.add_clue(uuid4(), "Clue", "Desc")
        assert result is None

    def test_validate_nonexistent_structure(self):
        """Test validating nonexistent structure."""
        service = MysteryService()
        check = service.validate_fair_play(uuid4())
        assert check.passes is False

    def test_generate_prompt_nonexistent_structure(self):
        """Test generating prompt for nonexistent structure."""
        service = MysteryService()
        prompt = service.generate_chapter_prompt(uuid4(), 1, 10)
        assert prompt == ""

    def test_empty_mystery(self):
        """Test service with empty mystery."""
        service = MysteryService()
        structure = service.create_structure()

        profiles = service.get_suspect_profiles(structure.id)
        assert profiles == ""

        check = service.validate_fair_play(structure.id)
        assert check.passes is False
