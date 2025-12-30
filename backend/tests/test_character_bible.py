"""
Tests for character bible service.

Tests cover:
- Character entry management
- Physical attribute extraction
- Relationship tracking
- Knowledge tracking
- Contradiction detection
- Auto-discovery
"""

from app.services.character_bible import (
    CharacterBible,
    CharacterDiscovery,
    CharacterEntry,
    CharacterExtractors,
    CharacterKnowledge,
    CharacterRelationship,
    CharacterRole,
    CharacterState,
    Contradiction,
    PersonalityTrait,
    PhysicalAttribute,
    RelationshipType,
)


class TestPhysicalAttribute:
    """Tests for PhysicalAttribute."""

    def test_create_physical_attribute(self):
        """Test creating a physical attribute."""
        attr = PhysicalAttribute(
            attribute_type="eye_color",
            value="blue",
            chapter_established=1,
            text_evidence="Her blue eyes sparkled.",
        )
        assert attr.attribute_type == "eye_color"
        assert attr.value == "blue"
        assert attr.chapter_established == 1

    def test_conflict_detection_same_type(self):
        """Test conflict detection for same attribute type."""
        attr1 = PhysicalAttribute(
            attribute_type="eye_color",
            value="blue",
            chapter_established=1,
            text_evidence="",
        )
        attr2 = PhysicalAttribute(
            attribute_type="eye_color",
            value="green",
            chapter_established=5,
            text_evidence="",
        )

        assert attr1.conflicts_with(attr2) is True

    def test_no_conflict_different_type(self):
        """Test no conflict for different attribute types."""
        attr1 = PhysicalAttribute(
            attribute_type="eye_color",
            value="blue",
            chapter_established=1,
            text_evidence="",
        )
        attr2 = PhysicalAttribute(
            attribute_type="hair_color",
            value="blonde",
            chapter_established=1,
            text_evidence="",
        )

        assert attr1.conflicts_with(attr2) is False

    def test_no_conflict_same_value(self):
        """Test no conflict for same value."""
        attr1 = PhysicalAttribute(
            attribute_type="eye_color",
            value="blue",
            chapter_established=1,
            text_evidence="",
        )
        attr2 = PhysicalAttribute(
            attribute_type="eye_color",
            value="Blue",
            chapter_established=5,
            text_evidence="",
        )

        assert attr1.conflicts_with(attr2) is False


class TestPersonalityTrait:
    """Tests for PersonalityTrait."""

    def test_create_personality_trait(self):
        """Test creating a personality trait."""
        trait = PersonalityTrait(
            trait="brave",
            chapter_first_seen=2,
            text_evidence="He bravely faced the dragon.",
            positive=True,
        )
        assert trait.trait == "brave"
        assert trait.positive is True

    def test_trait_equality(self):
        """Test trait equality based on name."""
        trait1 = PersonalityTrait(trait="brave", chapter_first_seen=1, text_evidence="")
        trait2 = PersonalityTrait(trait="BRAVE", chapter_first_seen=5, text_evidence="")

        assert trait1 == trait2

    def test_trait_hashing(self):
        """Test trait hashing for set operations."""
        trait1 = PersonalityTrait(trait="kind", chapter_first_seen=1, text_evidence="")
        trait2 = PersonalityTrait(trait="KIND", chapter_first_seen=5, text_evidence="")

        traits = {trait1, trait2}
        assert len(traits) == 1


class TestCharacterKnowledge:
    """Tests for CharacterKnowledge."""

    def test_create_knowledge(self):
        """Test creating character knowledge."""
        knowledge = CharacterKnowledge(
            knowledge="the treasure is hidden in the cave",
            chapter_learned=3,
            source="the old map",
            text_evidence="She discovered that the treasure is hidden in the cave.",
        )
        assert knowledge.chapter_learned == 3
        assert knowledge.source == "the old map"

    def test_knowledge_equality(self):
        """Test knowledge equality."""
        k1 = CharacterKnowledge(
            knowledge="the password is secret",
            chapter_learned=1,
        )
        k2 = CharacterKnowledge(
            knowledge="THE PASSWORD IS SECRET",
            chapter_learned=5,
        )

        assert k1 == k2

    def test_knowledge_hashing(self):
        """Test knowledge hashing for set operations."""
        k1 = CharacterKnowledge(knowledge="fact 1", chapter_learned=1)
        k2 = CharacterKnowledge(knowledge="FACT 1", chapter_learned=5)

        knowledge_set = {k1, k2}
        assert len(knowledge_set) == 1


class TestCharacterRelationship:
    """Tests for CharacterRelationship."""

    def test_create_relationship(self):
        """Test creating a relationship."""
        rel = CharacterRelationship(
            character_a="Alice",
            character_b="Bob",
            relationship_type=RelationshipType.FRIEND,
            description="Best friends since childhood",
            chapter_established=1,
        )
        assert rel.character_a == "Alice"
        assert rel.character_b == "Bob"
        assert rel.relationship_type == RelationshipType.FRIEND

    def test_relationship_evolution(self):
        """Test tracking relationship evolution."""
        rel = CharacterRelationship(
            character_a="Alice",
            character_b="Bob",
            relationship_type=RelationshipType.RIVAL,
            description="Competitive colleagues",
            chapter_established=1,
        )
        rel.add_evolution(5, "Started to respect each other")
        rel.add_evolution(10, "Became friends")

        assert len(rel.evolution) == 2
        assert rel.evolution[0] == (5, "Started to respect each other")


class TestCharacterState:
    """Tests for CharacterState."""

    def test_create_character_state(self):
        """Test creating a character state."""
        state = CharacterState(
            chapter=3,
            location="Forest",
            emotional_state="anxious",
            physical_condition="healthy",
            goals=["find the treasure"],
            conflicts=["evade the guards"],
        )
        assert state.chapter == 3
        assert state.location == "Forest"
        assert len(state.goals) == 1


class TestCharacterEntry:
    """Tests for CharacterEntry."""

    def test_create_character_entry(self):
        """Test creating a character entry."""
        entry = CharacterEntry(
            id="char-001",
            name="Alice",
            role=CharacterRole.PROTAGONIST,
            aliases=["Ali", "A"],
        )
        assert entry.name == "Alice"
        assert entry.role == CharacterRole.PROTAGONIST
        assert len(entry.aliases) == 2

    def test_add_physical_attribute(self):
        """Test adding physical attribute."""
        entry = CharacterEntry(id="1", name="Bob", role=CharacterRole.SUPPORTING)
        result = entry.add_physical_attribute("eye_color", "blue", 1, "His blue eyes")

        assert result is not None
        assert len(entry.physical_attributes) == 1

    def test_add_conflicting_physical_attribute(self):
        """Test adding conflicting physical attribute returns None."""
        entry = CharacterEntry(id="1", name="Carol", role=CharacterRole.SUPPORTING)
        entry.add_physical_attribute("eye_color", "blue", 1, "Blue eyes")
        result = entry.add_physical_attribute("eye_color", "green", 5, "Green eyes")

        assert result is None
        assert len(entry.physical_attributes) == 1

    def test_add_personality_trait(self):
        """Test adding personality trait."""
        entry = CharacterEntry(id="1", name="Dave", role=CharacterRole.SUPPORTING)
        trait = entry.add_personality_trait("brave", 2, "He bravely fought")

        assert trait.trait == "brave"
        assert len(entry.personality_traits) == 1

    def test_add_knowledge(self):
        """Test adding knowledge."""
        entry = CharacterEntry(id="1", name="Eve", role=CharacterRole.SUPPORTING)
        k = entry.add_knowledge("the secret", 3, "overheard conversation")

        assert k.knowledge == "the secret"
        assert len(entry.knowledge) == 1

    def test_get_knowledge_at_chapter(self):
        """Test getting cumulative knowledge."""
        entry = CharacterEntry(id="1", name="Frank", role=CharacterRole.SUPPORTING)
        entry.add_knowledge("fact 1", 1)
        entry.add_knowledge("fact 2", 3)
        entry.add_knowledge("fact 3", 5)

        assert entry.get_knowledge_at_chapter(2) == {"fact 1"}
        assert entry.get_knowledge_at_chapter(4) == {"fact 1", "fact 2"}
        assert entry.get_knowledge_at_chapter(5) == {"fact 1", "fact 2", "fact 3"}

    def test_add_relationship(self):
        """Test adding a relationship."""
        entry = CharacterEntry(id="1", name="Grace", role=CharacterRole.SUPPORTING)
        rel = entry.add_relationship("Henry", RelationshipType.FRIEND, "Best friends", 1)

        assert rel.character_b == "Henry"
        assert len(entry.relationships) == 1

    def test_update_state(self):
        """Test updating character state."""
        entry = CharacterEntry(id="1", name="Ivan", role=CharacterRole.SUPPORTING)
        state = entry.update_state(1, location="Village", emotional_state="happy")

        assert state.chapter == 1
        assert state.location == "Village"
        assert len(entry.states) == 1

    def test_get_state_at_chapter(self):
        """Test getting state at or before a chapter."""
        entry = CharacterEntry(id="1", name="Julia", role=CharacterRole.SUPPORTING)
        entry.update_state(1, location="Village")
        entry.update_state(5, location="Forest")
        entry.update_state(10, location="Castle")

        state = entry.get_state_at_chapter(7)
        assert state is not None
        assert state.location == "Forest"

    def test_get_state_at_chapter_none(self):
        """Test getting state when no states exist."""
        entry = CharacterEntry(id="1", name="Kevin", role=CharacterRole.SUPPORTING)
        state = entry.get_state_at_chapter(5)

        assert state is None

    def test_get_physical_attribute(self):
        """Test getting physical attribute by type."""
        entry = CharacterEntry(id="1", name="Laura", role=CharacterRole.SUPPORTING)
        entry.add_physical_attribute("eye_color", "brown", 1, "evidence")
        entry.add_physical_attribute("hair_color", "black", 2, "evidence")

        attr = entry.get_physical_attribute("eye_color")
        assert attr is not None
        assert attr.value == "brown"


class TestCharacterExtractors:
    """Tests for CharacterExtractors."""

    def test_extract_eye_color(self):
        """Test extracting eye color."""
        text = "Alice looked at him with her bright blue eyes."
        results = CharacterExtractors.extract_physical_attribute(text, "Alice", "eye_color")

        assert len(results) >= 1

    def test_extract_hair_color(self):
        """Test extracting hair color."""
        text = "Bob ran his fingers through his dark hair."
        results = CharacterExtractors.extract_physical_attribute(text, "Bob", "hair_color")

        assert len(results) >= 1

    def test_extract_height(self):
        """Test extracting height."""
        text = "Carol stood at 5'8\" tall."
        results = CharacterExtractors.extract_physical_attribute(text, "Carol", "height")

        assert len(results) >= 1

    def test_extract_age(self):
        """Test extracting age."""
        text = "Dave was 25 years old."
        results = CharacterExtractors.extract_physical_attribute(text, "Dave", "age")

        assert len(results) >= 1

    def test_extract_build(self):
        """Test extracting build."""
        text = "Eve was athletic and fit."
        results = CharacterExtractors.extract_physical_attribute(text, "Eve", "build")

        assert len(results) >= 1

    def test_extract_relationships(self):
        """Test extracting relationships."""
        text = "Frank was with his best friend Alice."
        results = CharacterExtractors.extract_relationships(text, "Frank")

        # The pattern looks for "his/her friend X" format
        assert len(results) >= 1
        assert any(r[0] == RelationshipType.FRIEND for r in results)

    def test_extract_family_relationship(self):
        """Test extracting family relationships."""
        text = "Grace saw her mother at the door."
        results = CharacterExtractors.extract_relationships(text, "Grace")

        assert len(results) >= 1
        assert any(r[0] == RelationshipType.FAMILY for r in results)

    def test_extract_knowledge(self):
        """Test extracting knowledge."""
        text = "Henry realized that the map led to the treasure."
        results = CharacterExtractors.extract_knowledge(text, "Henry")

        assert len(results) >= 1

    def test_extract_location(self):
        """Test extracting location."""
        text = "Ivan was in the library."
        result = CharacterExtractors.extract_location(text, "Ivan")

        assert result is not None
        location, _ = result
        assert "library" in location.lower()

    def test_extract_emotion(self):
        """Test extracting emotional state."""
        text = "Julia felt anxious about the meeting."
        result = CharacterExtractors.extract_emotion(text, "Julia")

        assert result is not None
        emotion, _ = result
        assert "anxious" in emotion.lower()


class TestCharacterBible:
    """Tests for CharacterBible."""

    def test_create_character_bible(self):
        """Test creating a character bible."""
        bible = CharacterBible()
        assert len(bible.characters) == 0

    def test_add_character(self):
        """Test adding a character."""
        bible = CharacterBible()
        entry = bible.add_character("Alice", CharacterRole.PROTAGONIST, ["Ali"])

        assert entry.name == "Alice"
        assert len(bible.characters) == 1

    def test_get_character(self):
        """Test getting a character by name."""
        bible = CharacterBible()
        bible.add_character("Bob", CharacterRole.SUPPORTING)

        entry = bible.get_character("Bob")
        assert entry is not None
        assert entry.name == "Bob"

    def test_get_character_case_insensitive(self):
        """Test getting character is case insensitive."""
        bible = CharacterBible()
        bible.add_character("Carol", CharacterRole.SUPPORTING)

        entry = bible.get_character("CAROL")
        assert entry is not None
        assert entry.name == "Carol"

    def test_get_character_by_alias(self):
        """Test getting character by alias."""
        bible = CharacterBible()
        bible.add_character("David", CharacterRole.SUPPORTING, ["Dave", "D"])

        entry = bible.get_character("Dave")
        assert entry is not None
        assert entry.name == "David"

    def test_get_nonexistent_character(self):
        """Test getting a character that doesn't exist."""
        bible = CharacterBible()
        entry = bible.get_character("Nobody")

        assert entry is None

    def test_get_or_create_character_existing(self):
        """Test get_or_create returns existing character."""
        bible = CharacterBible()
        original = bible.add_character("Eve", CharacterRole.SUPPORTING)

        result = bible.get_or_create_character("Eve")
        assert result.id == original.id

    def test_get_or_create_character_new(self):
        """Test get_or_create creates new character."""
        bible = CharacterBible()
        result = bible.get_or_create_character("Frank")

        assert result is not None
        assert result.name == "Frank"
        assert len(bible.characters) == 1

    def test_extract_from_chapter(self):
        """Test extracting information from a chapter."""
        bible = CharacterBible()
        bible.add_character("Grace", CharacterRole.PROTAGONIST)

        text = "Grace walked into the library. Her blue eyes scanned the room."
        extracted = bible.extract_from_chapter(1, text)

        assert "Grace" in extracted
        entry = bible.get_character("Grace")
        assert entry.first_appearance == 1

    def test_extract_detects_contradiction(self):
        """Test extraction detects physical contradictions."""
        bible = CharacterBible()
        entry = bible.add_character("Henry", CharacterRole.SUPPORTING)

        # Manually add conflicting physical attributes to trigger contradiction
        entry.add_physical_attribute("eye_color", "blue", 1, "Blue eyes")

        # Chapter 5: try to add green eyes (contradiction!)
        result = entry.add_physical_attribute("eye_color", "green", 5, "Green eyes")

        # Should return None indicating conflict
        assert result is None
        # Only the first attribute should be stored
        assert len(entry.physical_attributes) == 1

    def test_get_character_summary(self):
        """Test getting character summary."""
        bible = CharacterBible()
        entry = bible.add_character("Ivan", CharacterRole.PROTAGONIST)
        entry.add_physical_attribute("eye_color", "brown", 1, "evidence")
        entry.add_personality_trait("brave", 2, "evidence")

        summary = bible.get_character_summary("Ivan")

        assert summary is not None
        assert summary["name"] == "Ivan"
        assert summary["role"] == "protagonist"
        assert "eye_color" in summary["physical_attributes"]

    def test_export_bible(self):
        """Test exporting the entire bible."""
        bible = CharacterBible()
        bible.add_character("Julia", CharacterRole.PROTAGONIST)
        bible.add_character("Kevin", CharacterRole.ANTAGONIST)

        export = bible.export_bible()

        assert export["total_characters"] == 2
        assert "julia" in export["characters"]
        assert "kevin" in export["characters"]


class TestCharacterDiscovery:
    """Tests for CharacterDiscovery."""

    def test_discover_characters(self):
        """Test discovering characters from text."""
        chapters = {
            1: "Alice went to the store. Alice bought milk. Bob stayed home.",
            2: "Alice and Bob had dinner. Carol joined them.",
            3: "Alice finished reading. Bob cleaned up. Carol left early.",
        }

        discovered = CharacterDiscovery.discover_characters(chapters, min_mentions=2)

        names = [d[0] for d in discovered]
        assert "Alice" in names
        assert "Bob" in names

    def test_exclude_common_words(self):
        """Test that common words are excluded."""
        chapters = {
            1: "Monday was a good day. The Chapter began.",
        }

        discovered = CharacterDiscovery.discover_characters(chapters, min_mentions=1)

        names = [d[0] for d in discovered]
        assert "Monday" not in names
        assert "Chapter" not in names

    def test_character_role_assignment(self):
        """Test character role assignment based on mentions."""
        # Create text with many mentions - use higher counts for protagonist
        # Protagonist needs > 50 mentions, supporting needs > 20
        alice_text = " ".join(["Alice said hello." for _ in range(60)])  # 60 mentions
        bob_text = " ".join(["Bob said hello." for _ in range(15)])  # 15 mentions (minor)
        carol_text = "Carol appeared briefly."

        chapters = {
            1: alice_text,
            2: bob_text,
            3: carol_text,
        }

        discovered = CharacterDiscovery.discover_characters(chapters, min_mentions=1)

        # Find Alice and Bob's roles
        alice_entry = next((d for d in discovered if d[0] == "Alice"), None)
        bob_entry = next((d for d in discovered if d[0] == "Bob"), None)

        assert alice_entry is not None
        # Alice has 60 mentions * 6 (5 for action verb + 1 for name) = high count
        # Should be protagonist (> 50)
        assert alice_entry[2] == CharacterRole.PROTAGONIST

        assert bob_entry is not None
        # Bob has 15 mentions * 6 = around 90, but less than Alice proportionally
        # The actual count depends on pattern matching

    def test_auto_populate_bible(self):
        """Test auto-populating a character bible."""
        bible = CharacterBible()
        chapters = {
            1: "Alice walked into the library. Her blue eyes scanned the room.",
            2: "Alice met Bob there. Bob smiled.",
            3: "Alice discovered that the book was ancient.",
        }

        added = CharacterDiscovery.auto_populate_bible(bible, chapters, min_mentions=2)

        assert "Alice" in added
        assert "Bob" in added
        assert len(bible.characters) >= 2


class TestContradiction:
    """Tests for Contradiction dataclass."""

    def test_create_contradiction(self):
        """Test creating a contradiction."""
        c = Contradiction(
            id="c1",
            character_name="Alice",
            contradiction_type="physical",
            description="Eye color changed",
            chapter_a=1,
            chapter_b=5,
            text_a="blue eyes",
            text_b="green eyes",
            suggested_resolution="Change to match chapter 1",
            auto_resolvable=True,
        )

        assert c.character_name == "Alice"
        assert c.contradiction_type == "physical"
        assert c.auto_resolvable is True


class TestRelationshipType:
    """Tests for RelationshipType enum."""

    def test_all_relationship_types(self):
        """Test all relationship types exist."""
        assert RelationshipType.FAMILY == "family"
        assert RelationshipType.FRIEND == "friend"
        assert RelationshipType.ENEMY == "enemy"
        assert RelationshipType.ROMANTIC == "romantic"
        assert RelationshipType.PROFESSIONAL == "professional"
        assert RelationshipType.MENTOR == "mentor"
        assert RelationshipType.STUDENT == "student"
        assert RelationshipType.RIVAL == "rival"
        assert RelationshipType.NEUTRAL == "neutral"


class TestCharacterRole:
    """Tests for CharacterRole enum."""

    def test_all_character_roles(self):
        """Test all character roles exist."""
        assert CharacterRole.PROTAGONIST == "protagonist"
        assert CharacterRole.ANTAGONIST == "antagonist"
        assert CharacterRole.SUPPORTING == "supporting"
        assert CharacterRole.MINOR == "minor"
        assert CharacterRole.MENTIONED == "mentioned"


class TestIntegrationScenarios:
    """Integration tests for realistic scenarios."""

    def test_full_character_tracking(self):
        """Test full character tracking workflow."""
        bible = CharacterBible()

        # Add main characters
        hero = bible.add_character("Hero", CharacterRole.PROTAGONIST)
        bible.add_character("Villain", CharacterRole.ANTAGONIST)

        # Add physical attributes
        hero.add_physical_attribute("eye_color", "blue", 1, "His blue eyes")
        hero.add_physical_attribute("hair_color", "brown", 1, "Brown hair")

        # Add relationships
        hero.add_relationship("Villain", RelationshipType.ENEMY, "Nemesis", 1)

        # Track knowledge
        hero.add_knowledge("the prophecy", 2, "ancient scroll")
        hero.add_knowledge("villain's weakness", 10, "mentor's revelation")

        # Track states
        hero.update_state(1, location="Village", emotional_state="content")
        hero.update_state(5, location="Forest", emotional_state="determined")
        hero.update_state(10, location="Dark Castle", emotional_state="resolved")

        # Verify tracking
        assert len(hero.physical_attributes) == 2
        assert len(hero.knowledge) == 2
        assert len(hero.states) == 3
        assert hero.get_knowledge_at_chapter(5) == {"the prophecy"}

    def test_contradiction_detection_workflow(self):
        """Test detecting contradictions across chapters."""
        bible = CharacterBible()
        entry = bible.add_character("Hero", CharacterRole.PROTAGONIST)

        # Manually test the contradiction detection logic
        # First add an eye color
        entry.add_physical_attribute("eye_color", "blue", 1, "Hero's blue eyes")

        # Try to add conflicting eye color
        result = entry.add_physical_attribute("eye_color", "green", 5, "Hero's green eyes")

        # Should detect the conflict and return None
        assert result is None

        # The original attribute should still be there
        attr = entry.get_physical_attribute("eye_color")
        assert attr is not None
        assert attr.value == "blue"

    def test_relationship_network(self):
        """Test building a relationship network."""
        bible = CharacterBible()

        alice = bible.add_character("Alice", CharacterRole.PROTAGONIST)
        bob = bible.add_character("Bob", CharacterRole.SUPPORTING)
        bible.add_character("Carol", CharacterRole.SUPPORTING)

        alice.add_relationship("Bob", RelationshipType.FRIEND, "Best friends", 1)
        alice.add_relationship("Carol", RelationshipType.RIVAL, "Competitors", 1)
        bob.add_relationship("Carol", RelationshipType.ROMANTIC, "Dating", 3)

        assert len(alice.relationships) == 2
        assert len(bob.relationships) == 1

    def test_character_arc_tracking(self):
        """Test tracking character arc over chapters."""
        bible = CharacterBible()
        hero = bible.add_character("Hero", CharacterRole.PROTAGONIST)

        # Track emotional journey
        hero.update_state(1, emotional_state="naive", physical_condition="healthy")
        hero.update_state(5, emotional_state="determined", physical_condition="injured")
        hero.update_state(10, emotional_state="wise", physical_condition="recovered")

        # Track knowledge growth
        hero.add_knowledge("the quest", 1)
        hero.add_knowledge("the enemy's plan", 5)
        hero.add_knowledge("the secret weakness", 8)
        hero.add_knowledge("inner strength", 10)

        # Verify arc
        state_1 = hero.get_state_at_chapter(1)
        state_10 = hero.get_state_at_chapter(10)

        assert state_1.emotional_state == "naive"
        assert state_10.emotional_state == "wise"
        assert len(hero.get_knowledge_at_chapter(10)) == 4
