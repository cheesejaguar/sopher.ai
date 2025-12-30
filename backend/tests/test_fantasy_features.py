"""Tests for fantasy-specific features."""

from uuid import uuid4

from app.agents.genres.fantasy import (
    ConsistencyChecker,
    FantasyRace,
    FantasyService,
    FantasySubgenre,
    MagicAbility,
    MagicRule,
    MagicSystem,
    MagicSystemBuilder,
    MagicSystemType,
    NamingConvention,
    NamingConventionEnforcer,
    WorldBuilding,
    WorldBuildingCategory,
    WorldBuildingManager,
    WorldElement,
)


class TestEnums:
    """Tests for enum classes."""

    def test_magic_system_type_values(self):
        """Test MagicSystemType enum values."""
        assert MagicSystemType.HARD.value == "hard"
        assert MagicSystemType.SOFT.value == "soft"
        assert MagicSystemType.ELEMENTAL.value == "elemental"

    def test_world_building_category_values(self):
        """Test WorldBuildingCategory enum values."""
        assert WorldBuildingCategory.GEOGRAPHY.value == "geography"
        assert WorldBuildingCategory.MAGIC.value == "magic"

    def test_fantasy_subgenre_values(self):
        """Test FantasySubgenre enum values."""
        assert FantasySubgenre.EPIC.value == "epic"
        assert FantasySubgenre.GRIMDARK.value == "grimdark"

    def test_naming_convention_values(self):
        """Test NamingConvention enum values."""
        assert NamingConvention.ELVISH.value == "elvish"
        assert NamingConvention.DWARVEN.value == "dwarven"


class TestDataclasses:
    """Tests for dataclasses."""

    def test_magic_rule_defaults(self):
        """Test MagicRule default values."""
        rule = MagicRule()
        assert rule.name == ""
        assert rule.examples == []

    def test_magic_ability_defaults(self):
        """Test MagicAbility default values."""
        ability = MagicAbility()
        assert ability.power_level == 1
        assert ability.requirements == []

    def test_magic_system_defaults(self):
        """Test MagicSystem default values."""
        system = MagicSystem()
        assert system.system_type == MagicSystemType.HYBRID
        assert system.rules == []

    def test_world_element_defaults(self):
        """Test WorldElement default values."""
        element = WorldElement()
        assert element.category == WorldBuildingCategory.GEOGRAPHY
        assert element.first_mentioned == 0

    def test_fantasy_race_defaults(self):
        """Test FantasyRace default values."""
        race = FantasyRace()
        assert race.naming_convention == NamingConvention.INVENTED

    def test_world_building_defaults(self):
        """Test WorldBuilding default values."""
        world = WorldBuilding()
        assert world.subgenre == FantasySubgenre.HIGH
        assert world.elements == []


class TestMagicSystemBuilder:
    """Tests for MagicSystemBuilder."""

    def test_create_system(self):
        """Test creating a magic system."""
        builder = MagicSystemBuilder()
        system = builder.create_system(
            name="The Arcane Arts",
            system_type=MagicSystemType.HARD,
            source="life energy",
            cost="physical exhaustion",
        )

        assert system.name == "The Arcane Arts"
        assert system.system_type == MagicSystemType.HARD

    def test_get_system(self):
        """Test getting a system."""
        builder = MagicSystemBuilder()
        created = builder.create_system("Test System")
        retrieved = builder.get_system(created.id)

        assert retrieved is not None
        assert retrieved.name == "Test System"

    def test_add_rule(self):
        """Test adding a rule."""
        builder = MagicSystemBuilder()
        system = builder.create_system("Test System")

        rule = builder.add_rule(
            system.id,
            "Law of Conservation",
            "Magic cannot create or destroy, only transform",
        )

        assert rule is not None
        assert len(system.rules) == 1

    def test_add_ability(self):
        """Test adding an ability."""
        builder = MagicSystemBuilder()
        system = builder.create_system("Test System")

        ability = builder.add_ability(
            system.id,
            "Fireball",
            "Conjure a ball of flame",
            power_level=5,
        )

        assert ability is not None
        assert len(system.abilities) == 1

    def test_validate_hard_system(self):
        """Test validating a hard magic system."""
        builder = MagicSystemBuilder()
        system = builder.create_system(
            "Hard System",
            system_type=MagicSystemType.HARD,
        )

        issues = builder.validate_system(system.id)

        assert len(issues) > 0
        assert any("source" in issue.lower() for issue in issues)

    def test_validate_complete_hard_system(self):
        """Test validating a complete hard magic system."""
        builder = MagicSystemBuilder()
        system = builder.create_system(
            "Complete System",
            system_type=MagicSystemType.HARD,
            source="life energy",
            cost="exhaustion",
            description="A well-defined magic system",
        )
        system.limitations = ["Cannot raise the dead"]
        builder.add_rule(system.id, "Rule 1", "Description 1")
        builder.add_rule(system.id, "Rule 2", "Description 2")

        issues = builder.validate_system(system.id)
        assert len(issues) == 0

    def test_generate_system_prompt(self):
        """Test generating system prompt."""
        builder = MagicSystemBuilder()
        system = builder.create_system(
            "The Weave",
            system_type=MagicSystemType.HARD,
            source="the Weave between worlds",
            cost="mental fatigue",
            description="Magic drawn from threads of reality",
        )
        builder.add_rule(system.id, "Thread Limit", "Can only hold 3 threads at once")

        prompt = builder.generate_system_prompt(system)

        assert "The Weave" in prompt
        assert "hard" in prompt.lower()
        assert "Thread Limit" in prompt


class TestWorldBuildingManager:
    """Tests for WorldBuildingManager."""

    def test_create_world(self):
        """Test creating a world."""
        manager = WorldBuildingManager()
        world = manager.create_world(
            world_name="Eldoria",
            subgenre=FantasySubgenre.EPIC,
            era="ancient",
        )

        assert world.world_name == "Eldoria"
        assert world.subgenre == FantasySubgenre.EPIC

    def test_get_world(self):
        """Test getting a world."""
        manager = WorldBuildingManager()
        created = manager.create_world("Test World")
        retrieved = manager.get_world(created.id)

        assert retrieved is not None
        assert retrieved.world_name == "Test World"

    def test_add_element(self):
        """Test adding a world element."""
        manager = WorldBuildingManager()
        world = manager.create_world("Test World")

        element = manager.add_element(
            world.id,
            "Crystal Mountains",
            WorldBuildingCategory.GEOGRAPHY,
            "Mountains made of pure crystal",
        )

        assert element is not None
        assert len(world.elements) == 1

    def test_add_race(self):
        """Test adding a fantasy race."""
        manager = WorldBuildingManager()
        world = manager.create_world("Test World")

        race = manager.add_race(
            world.id,
            "Elves",
            "Ancient immortal beings",
            naming_convention=NamingConvention.ELVISH,
        )

        assert race is not None
        assert len(world.races) == 1

    def test_add_established_fact(self):
        """Test adding established facts."""
        manager = WorldBuildingManager()
        world = manager.create_world("Test World")

        result = manager.add_established_fact(world.id, "Dragons went extinct 1000 years ago")

        assert result is True
        assert len(world.established_facts) == 1

    def test_get_elements_by_category(self):
        """Test getting elements by category."""
        manager = WorldBuildingManager()
        world = manager.create_world("Test World")

        manager.add_element(world.id, "Mountain", WorldBuildingCategory.GEOGRAPHY, "A mountain")
        manager.add_element(world.id, "Kingdom", WorldBuildingCategory.POLITICS, "A kingdom")
        manager.add_element(world.id, "River", WorldBuildingCategory.GEOGRAPHY, "A river")

        geo_elements = manager.get_elements_by_category(world.id, WorldBuildingCategory.GEOGRAPHY)
        assert len(geo_elements) == 2

    def test_generate_world_summary(self):
        """Test generating world summary."""
        manager = WorldBuildingManager()
        world = manager.create_world("Eldoria", era="medieval")
        manager.add_element(
            world.id, "Dragon Peaks", WorldBuildingCategory.GEOGRAPHY, "Home of dragons"
        )
        manager.add_race(world.id, "Elves", "Immortal forest dwellers")
        manager.add_established_fact(world.id, "Magic is fading")

        summary = manager.generate_world_summary(world)

        assert "Eldoria" in summary
        assert "Dragon Peaks" in summary
        assert "Elves" in summary
        assert "Magic is fading" in summary


class TestNamingConventionEnforcer:
    """Tests for NamingConventionEnforcer."""

    def test_get_convention_rules(self):
        """Test getting convention rules."""
        enforcer = NamingConventionEnforcer()
        rules = enforcer.get_convention_rules(NamingConvention.ELVISH)

        assert "common_endings" in rules
        assert "examples" in rules

    def test_suggest_names(self):
        """Test suggesting names."""
        enforcer = NamingConventionEnforcer()
        names = enforcer.suggest_names(NamingConvention.DWARVEN, count=3)

        assert len(names) == 3
        assert all(isinstance(n, str) for n in names)

    def test_validate_elvish_name_valid(self):
        """Test validating a valid elvish name."""
        enforcer = NamingConventionEnforcer()
        valid, message = enforcer.validate_name("Galadriel", NamingConvention.ELVISH)

        assert valid is True

    def test_validate_elvish_name_invalid(self):
        """Test validating an invalid elvish name."""
        enforcer = NamingConventionEnforcer()
        # Too consonant-heavy for elvish
        valid, message = enforcer.validate_name("Grmblx", NamingConvention.ELVISH)

        assert valid is False
        assert "vowel" in message.lower()

    def test_validate_dwarven_name(self):
        """Test validating a dwarven name."""
        enforcer = NamingConventionEnforcer()
        valid, message = enforcer.validate_name("Thorin", NamingConvention.DWARVEN)

        # Thorin has balanced vowels, should pass
        assert valid is True

    def test_generate_naming_prompt(self):
        """Test generating naming prompt."""
        enforcer = NamingConventionEnforcer()
        prompt = enforcer.generate_naming_prompt(NamingConvention.NORSE)

        assert "norse" in prompt.lower()
        assert "endings" in prompt.lower() or "prefixes" in prompt.lower()


class TestConsistencyChecker:
    """Tests for ConsistencyChecker."""

    def test_record_fact(self):
        """Test recording a fact."""
        checker = ConsistencyChecker()
        checker.record_fact("dragon_color", "red", chapter=1)

        # Should not raise
        assert True

    def test_check_consistency_no_conflict(self):
        """Test checking consistency with no conflicts."""
        checker = ConsistencyChecker()
        checker.record_fact("dragon_color", "red", chapter=1)
        checker.record_fact("dragon_color", "red", chapter=5)

        issues = checker.check_consistency("dragon_color")
        assert len(issues) == 0

    def test_check_consistency_with_conflict(self):
        """Test checking consistency with conflicts."""
        checker = ConsistencyChecker()
        checker.record_fact("eye_color", "blue", chapter=1)
        checker.record_fact("eye_color", "green", chapter=5)

        issues = checker.check_consistency("eye_color")
        assert len(issues) == 1
        assert issues[0].issue_type == "conflicting_values"

    def test_check_magic_consistency_undefined_ability(self):
        """Test checking undefined magic ability."""
        checker = ConsistencyChecker()
        system = MagicSystem(
            name="Test System",
            system_type=MagicSystemType.HARD,
        )
        system.abilities = [MagicAbility(name="Fireball")]

        usage_log = [
            {"ability": "Lightning Bolt", "chapter": 5},
        ]

        issues = checker.check_magic_consistency(system, usage_log)
        assert len(issues) == 1
        assert issues[0].issue_type == "undefined_ability"

    def test_check_magic_consistency_unpaid_cost(self):
        """Test checking magic used without paying cost."""
        checker = ConsistencyChecker()
        system = MagicSystem(
            name="Test System",
            cost="exhaustion",
        )
        system.abilities = [MagicAbility(name="Healing")]

        usage_log = [
            {"ability": "Healing", "chapter": 3, "no_cost": True},
        ]

        issues = checker.check_magic_consistency(system, usage_log)
        assert len(issues) == 1
        assert issues[0].issue_type == "unpaid_cost"


class TestFantasyService:
    """Tests for FantasyService."""

    def test_create_world(self):
        """Test creating a world."""
        service = FantasyService()
        world = service.create_world(
            "Eldoria",
            subgenre=FantasySubgenre.EPIC,
        )

        assert world.world_name == "Eldoria"

    def test_get_world(self):
        """Test getting a world."""
        service = FantasyService()
        created = service.create_world("Test World")
        retrieved = service.get_world(created.id)

        assert retrieved is not None

    def test_create_magic_system(self):
        """Test creating magic system for a world."""
        service = FantasyService()
        world = service.create_world("Test World")

        system = service.create_magic_system(
            world.id,
            "The Arcane",
            system_type=MagicSystemType.HARD,
        )

        assert system is not None
        assert world.magic_system is not None

    def test_add_magic_rule(self):
        """Test adding magic rule."""
        service = FantasyService()
        world = service.create_world("Test World")
        service.create_magic_system(world.id, "Magic System")

        rule = service.add_magic_rule(world.id, "Law of Threes", "Spells require three components")

        assert rule is not None

    def test_add_world_element(self):
        """Test adding world element."""
        service = FantasyService()
        world = service.create_world("Test World")

        element = service.add_world_element(
            world.id,
            "The Great Forest",
            WorldBuildingCategory.GEOGRAPHY,
            "An ancient forest",
        )

        assert element is not None

    def test_add_race(self):
        """Test adding race."""
        service = FantasyService()
        world = service.create_world("Test World")

        race = service.add_race(world.id, "Elves", "Immortal beings")

        assert race is not None

    def test_validate_magic_system(self):
        """Test validating magic system."""
        service = FantasyService()
        world = service.create_world("Test World")
        service.create_magic_system(world.id, "System", system_type=MagicSystemType.HARD)

        issues = service.validate_magic_system(world.id)

        assert len(issues) > 0  # Incomplete hard system

    def test_get_naming_rules(self):
        """Test getting naming rules."""
        service = FantasyService()
        rules = service.get_naming_rules(NamingConvention.ELVISH)

        assert "examples" in rules

    def test_validate_name(self):
        """Test validating a name."""
        service = FantasyService()
        # Galadriel has high vowel ratio for elvish
        valid, message = service.validate_name("Galadriel", NamingConvention.ELVISH)

        assert valid is True

    def test_generate_chapter_prompt(self):
        """Test generating chapter prompt."""
        service = FantasyService()
        world = service.create_world("Eldoria", subgenre=FantasySubgenre.EPIC)
        service.create_magic_system(world.id, "The Weave", source="world energy")
        service.add_world_element(
            world.id,
            "Crystal Tower",
            WorldBuildingCategory.GEOGRAPHY,
            "Ancient tower",
            first_mentioned=1,
        )

        prompt = service.generate_chapter_prompt(world.id, 2, 20)

        assert len(prompt) > 0
        assert "epic" in prompt.lower()
        assert "Crystal Tower" in prompt

    def test_get_world_summary(self):
        """Test getting world summary."""
        service = FantasyService()
        world = service.create_world("Eldoria")
        service.add_race(world.id, "Elves", "Forest dwellers")

        summary = service.get_world_summary(world.id)

        assert "Eldoria" in summary
        assert "Elves" in summary


class TestIntegration:
    """Integration tests for fantasy features."""

    def test_complete_world_setup(self):
        """Test setting up a complete fantasy world."""
        service = FantasyService()

        # Create world
        world = service.create_world(
            "The Realm of Shadows",
            subgenre=FantasySubgenre.DARK,
            era="ancient",
        )

        # Create magic system
        system = service.create_magic_system(
            world.id,
            "Shadow Magic",
            system_type=MagicSystemType.HARD,
            source="the void between worlds",
            cost="sanity",
            description="Dark magic drawn from shadows",
        )
        system.limitations = ["Cannot be used in bright light"]
        system.consequences = ["Gradual madness", "Shadow corruption"]

        service.add_magic_rule(
            world.id,
            "Darkness Required",
            "Must have shadows present to cast",
        )

        # Add world elements
        service.add_world_element(
            world.id,
            "The Shadowfen",
            WorldBuildingCategory.GEOGRAPHY,
            "A perpetually dark marshland",
            first_mentioned=1,
        )
        service.add_world_element(
            world.id,
            "The Hollow Kingdom",
            WorldBuildingCategory.POLITICS,
            "An underground realm of shadow dwellers",
            first_mentioned=2,
        )

        # Add races
        service.add_race(
            world.id,
            "Umbrals",
            "Shadow-touched humans",
            naming_convention=NamingConvention.INVENTED,
        )

        # Validate
        issues = service.validate_magic_system(world.id)
        assert len(issues) < 2  # May have minor issues

        # Generate prompts
        ch1_prompt = service.generate_chapter_prompt(world.id, 1, 20)
        service.generate_chapter_prompt(world.id, 5, 20)

        assert "dark" in ch1_prompt.lower()
        assert "Shadow Magic" in ch1_prompt


class TestEdgeCases:
    """Tests for edge cases."""

    def test_get_nonexistent_world(self):
        """Test getting nonexistent world."""
        service = FantasyService()
        result = service.get_world(uuid4())
        assert result is None

    def test_create_magic_system_nonexistent_world(self):
        """Test creating magic system for nonexistent world."""
        service = FantasyService()
        result = service.create_magic_system(uuid4(), "System")
        assert result is None

    def test_add_rule_no_magic_system(self):
        """Test adding rule to world without magic system."""
        service = FantasyService()
        world = service.create_world("Test World")

        result = service.add_magic_rule(world.id, "Rule", "Description")
        assert result is None

    def test_validate_no_magic_system(self):
        """Test validating world without magic system."""
        service = FantasyService()
        world = service.create_world("Test World")

        issues = service.validate_magic_system(world.id)
        assert len(issues) > 0

    def test_generate_prompt_nonexistent_world(self):
        """Test generating prompt for nonexistent world."""
        service = FantasyService()
        prompt = service.generate_chapter_prompt(uuid4(), 1, 10)
        assert prompt == ""

    def test_naming_convention_not_defined(self):
        """Test naming convention not in patterns."""
        enforcer = NamingConventionEnforcer()
        rules = enforcer.get_convention_rules(NamingConvention.ENGLISH)
        # English not specifically defined, should return empty dict
        assert rules == {}
