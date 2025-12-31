"""Tests for outline revision schemas and endpoint validation.

Tests cover:
- OutlineRevision schema validation
- Input validation for outline operations
- Endpoint route registration
"""

from uuid import uuid4

import pytest

from app.schemas import BookOutline, ChapterOutline, OutlineRevision, PlotStructure


class TestOutlineRevisionSchema:
    """Tests for OutlineRevision schema validation."""

    def test_valid_revision_request(self):
        """Test valid revision request with minimal fields."""
        revision = OutlineRevision(
            revision_instructions="Add more conflict between the protagonist and antagonist"
        )

        assert revision.revision_instructions is not None
        assert len(revision.revision_instructions) >= 10
        assert revision.chapters_to_revise is None
        assert revision.preserve_chapters is None
        assert revision.add_chapters is None
        assert revision.remove_chapters is None

    def test_revision_with_chapter_options(self):
        """Test revision with chapter-specific options."""
        revision = OutlineRevision(
            revision_instructions="Revise the pacing in the middle chapters",
            chapters_to_revise=[5, 6, 7],
            preserve_chapters=[1, 2, 10],
            add_chapters=2,
        )

        assert revision.chapters_to_revise == [5, 6, 7]
        assert revision.preserve_chapters == [1, 2, 10]
        assert revision.add_chapters == 2
        assert revision.remove_chapters is None

    def test_revision_with_remove_chapters(self):
        """Test revision with chapters to remove."""
        revision = OutlineRevision(
            revision_instructions="Remove filler chapters and tighten the narrative",
            remove_chapters=[4, 8],
        )

        assert revision.remove_chapters == [4, 8]

    def test_revision_instructions_too_short(self):
        """Test that short instructions are rejected."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError) as exc_info:
            OutlineRevision(revision_instructions="short")

        errors = exc_info.value.errors()
        assert len(errors) == 1
        assert "revision_instructions" in str(errors[0]["loc"])

    def test_revision_instructions_too_long(self):
        """Test that overly long instructions are rejected."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            OutlineRevision(revision_instructions="x" * 5001)

    def test_revision_with_outline_id(self):
        """Test revision with specific outline ID."""
        outline_id = uuid4()
        revision = OutlineRevision(
            outline_id=outline_id,
            revision_instructions="Revise based on feedback from editor",
        )

        assert revision.outline_id == outline_id

    def test_revision_add_chapters_bounds(self):
        """Test add_chapters field bounds."""
        from pydantic import ValidationError

        # Valid bounds
        revision = OutlineRevision(
            revision_instructions="Add more chapters to expand the story",
            add_chapters=5,
        )
        assert revision.add_chapters == 5

        # Too many chapters
        with pytest.raises(ValidationError):
            OutlineRevision(
                revision_instructions="Add way too many chapters",
                add_chapters=25,
            )


class TestBookOutlineWithRevision:
    """Tests for BookOutline schema with revision metadata."""

    def test_book_outline_revision_number(self):
        """Test that BookOutline tracks revision numbers."""
        synopsis = "A comprehensive story about testing software. " * 5

        outline = BookOutline(
            title="Test Book",
            logline="A story about testing",
            synopsis=synopsis,
            revision_number=1,
        )

        assert outline.revision_number == 1

        # Increment revision
        outline2 = BookOutline(
            title="Test Book",
            logline="A story about testing",
            synopsis=synopsis,
            revision_number=2,
        )

        assert outline2.revision_number == 2

    def test_book_outline_with_generated_metadata(self):
        """Test BookOutline with generation metadata."""
        from datetime import datetime

        synopsis = "A comprehensive story about testing software. " * 5

        outline = BookOutline(
            title="AI Generated Book",
            logline="An exciting AI-generated story",
            synopsis=synopsis,
            generated_at=datetime.utcnow(),
            model_used="gpt-5",
            revision_number=1,
        )

        assert outline.generated_at is not None
        assert outline.model_used == "gpt-5"


class TestOutlineEndpointRoutes:
    """Tests for outline endpoint route registration."""

    def test_outline_routes_exist(self):
        """Test that outline routes are registered."""
        from app.main import app

        routes = [route.path for route in app.routes]

        # Check that outline routes are registered
        assert any("/projects/{project_id}/outline" in route for route in routes)

    def test_outline_stream_route_exists(self):
        """Test that outline stream route is registered."""
        from app.main import app

        routes = [route.path for route in app.routes]

        assert any("/projects/{project_id}/outline/stream" in route for route in routes)

    def test_outline_revise_route_exists(self):
        """Test that outline revise route is registered."""
        from app.main import app

        routes = [route.path for route in app.routes]

        assert any("/projects/{project_id}/outline/revise/stream" in route for route in routes)


class TestChapterOutlineValidation:
    """Tests for ChapterOutline schema validation."""

    def test_valid_chapter_outline(self):
        """Test valid chapter outline creation."""
        chapter = ChapterOutline(
            number=1,
            title="The Beginning",
            summary="Our story begins in a small town where the protagonist lives.",
            setting="Small town, early morning",
        )

        assert chapter.number == 1
        assert chapter.title == "The Beginning"
        assert chapter.emotional_arc == "rising_action"  # Default
        assert chapter.estimated_word_count == 3000  # Default

    def test_chapter_number_bounds(self):
        """Test chapter number validation bounds."""
        from pydantic import ValidationError

        # Valid chapter numbers
        ChapterOutline(
            number=1,
            title="First",
            summary="A valid summary that meets length requirements",
            setting="Some location",
        )
        ChapterOutline(
            number=100,
            title="Last",
            summary="A valid summary that meets length requirements",
            setting="Some location",
        )

        # Invalid chapter number
        with pytest.raises(ValidationError):
            ChapterOutline(
                number=0,
                title="Invalid",
                summary="A valid summary that meets length requirements",
                setting="Some location",
            )

        with pytest.raises(ValidationError):
            ChapterOutline(
                number=101,
                title="Invalid",
                summary="A valid summary that meets length requirements",
                setting="Some location",
            )

    def test_chapter_with_all_fields(self):
        """Test chapter outline with all fields populated."""
        from app.schemas import ChapterHooks

        chapter = ChapterOutline(
            number=5,
            title="The Turning Point",
            summary="A critical chapter where everything changes for the protagonist",
            key_events=["Discovery of the truth", "Confrontation with mentor", "Decision to act"],
            characters_involved=["Protagonist", "Mentor", "Antagonist"],
            emotional_arc="climax",
            pov_character="Protagonist",
            setting="The ancient library at midnight",
            estimated_word_count=4500,
            hooks=ChapterHooks(
                opening_hook="The dust had barely settled when she heard the footsteps.",
                closing_hook="And in that moment, she knew nothing would ever be the same.",
            ),
            notes="Key chapter - ensure proper buildup in previous chapters",
        )

        assert len(chapter.key_events) == 3
        assert len(chapter.characters_involved) == 3
        assert chapter.emotional_arc == "climax"
        assert chapter.hooks is not None


class TestPlotStructureValidation:
    """Tests for PlotStructure schema validation."""

    def test_three_act_structure(self):
        """Test three-act structure creation."""
        structure = PlotStructure(
            structure_type="three_act",
            act_one_chapters=[1, 2, 3],
            act_two_chapters=[4, 5, 6, 7],
            act_three_chapters=[8, 9, 10],
        )

        assert structure.structure_type == "three_act"
        assert len(structure.act_one_chapters) == 3
        assert len(structure.act_two_chapters) == 4
        assert len(structure.act_three_chapters) == 3

    def test_heros_journey_structure(self):
        """Test hero's journey structure with all stages."""
        structure = PlotStructure(
            structure_type="heros_journey",
            ordinary_world="Luke on Tatooine, longing for adventure",
            call_to_adventure="Princess Leia's holographic message",
            refusal_of_call="Luke's uncle needs him for the harvest",
            meeting_mentor="Obi-Wan Kenobi reveals Luke's heritage",
            crossing_threshold="Leaving Tatooine with Han Solo",
            tests_allies_enemies="Death Star infiltration",
            approach_innermost_cave="Approaching the Death Star's core",
            ordeal="Rescuing Leia, losing Obi-Wan",
            reward="Escaping with the plans",
            road_back="The Rebellion's counterattack",
            resurrection="The trench run, trusting the Force",
            return_with_elixir="Medal ceremony, hero status achieved",
        )

        assert structure.structure_type == "heros_journey"
        assert structure.ordinary_world is not None
        assert structure.return_with_elixir is not None

    def test_all_structure_types_valid(self):
        """Test all valid structure types."""
        valid_types = [
            "three_act",
            "five_act",
            "heros_journey",
            "seven_point",
            "save_the_cat",
            "freytags_pyramid",
            "custom",
        ]

        for structure_type in valid_types:
            structure = PlotStructure(structure_type=structure_type)
            assert structure.structure_type == structure_type

    def test_invalid_structure_type(self):
        """Test that invalid structure types are rejected."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PlotStructure(structure_type="invalid_type")


class TestOutlineRequestValidation:
    """Tests for OutlineRequest with enhanced fields."""

    def test_outline_request_with_plot_structure(self):
        """Test outline request with plot structure type."""
        from app.schemas import OutlineRequest

        request = OutlineRequest(
            brief="A thrilling story about a hero's journey through a magical land",
            plot_structure_type="heros_journey",
            target_chapters=12,
            genre="fantasy",
        )

        assert request.plot_structure_type == "heros_journey"
        assert request.target_chapters == 12

    def test_outline_request_with_character_profiles(self):
        """Test outline request with character profiles."""
        from app.schemas import CharacterProfile, OutlineRequest

        request = OutlineRequest(
            brief="A detective story set in 1920s New York",
            character_profiles={
                "Detective": CharacterProfile(
                    name="Jack Morrison",
                    role="protagonist",
                    description="A hard-boiled detective with a hidden past and a moral code he refuses to break.",
                    personality_traits=["determined", "cynical", "loyal"],
                ),
            },
            genre="mystery",
        )

        assert "Detective" in request.character_profiles
        assert request.character_profiles["Detective"].name == "Jack Morrison"

    def test_outline_request_with_world_building(self):
        """Test outline request with world building elements."""
        from app.schemas import OutlineRequest, WorldBuildingElement

        request = OutlineRequest(
            brief="An epic fantasy in a world where magic is dying",
            world_building={
                "The Fade": WorldBuildingElement(
                    name="The Fade",
                    category="magic_system",
                    description="The gradual disappearance of magic from the world, happening over centuries",
                    rules=["Magic weakens near iron", "Old spells work but new ones fail"],
                ),
            },
            genre="fantasy",
        )

        assert "The Fade" in request.world_building
        assert request.world_building["The Fade"].category == "magic_system"


class TestOutlineStreamTimeout:
    """Tests for outline stream timeout handling."""

    def test_check_stream_timeout_not_exceeded(self):
        """Test check_stream_timeout returns False when not exceeded."""
        import asyncio

        from app.routers.outline import check_stream_timeout

        # Use current time
        start_time = asyncio.get_event_loop().time()
        result = check_stream_timeout(start_time, timeout=60)

        assert result is False

    def test_check_stream_timeout_exceeded(self):
        """Test check_stream_timeout returns True when exceeded."""
        import asyncio

        from app.routers.outline import check_stream_timeout

        # Use time far in the past
        start_time = asyncio.get_event_loop().time() - 100
        result = check_stream_timeout(start_time, timeout=60)

        assert result is True


class TestOutlineRouterConfig:
    """Tests for outline router configuration."""

    def test_router_has_correct_prefix(self):
        """Test router has correct prefix."""
        from app.routers.outline import router

        assert router.prefix == "/projects/{project_id}"

    def test_router_has_outline_tag(self):
        """Test router has outline tag."""
        from app.routers.outline import router

        assert "outline" in router.tags

    def test_stream_timeout_default(self):
        """Test default stream timeout value."""
        from app.routers.outline import STREAM_TIMEOUT_SECONDS

        assert STREAM_TIMEOUT_SECONDS == 1800  # 30 minutes default


class TestOutlineHelperFunctions:
    """Tests for outline helper functions."""

    @pytest.mark.asyncio
    async def test_event_generator_cached_response(self):
        """Test event_generator returns cached content when available."""
        from unittest.mock import AsyncMock, MagicMock, patch

        from fastapi import Request

        from app.routers.outline import event_generator
        from app.schemas import OutlineRequest
        from app.security import TokenData

        mock_request = MagicMock(spec=Request)
        mock_request.is_disconnected = AsyncMock(return_value=False)
        mock_session = MagicMock()
        mock_session.id = uuid4()
        mock_db = AsyncMock()
        mock_user = TokenData(user_id=str(uuid4()))
        outline_request = OutlineRequest(brief="A thrilling story about adventure and discovery")

        with patch("app.routers.outline.cache") as mock_cache:
            mock_cache.cache_key.return_value = "test-key"
            mock_cache.get = AsyncMock(return_value="Cached outline content")
            mock_cache.set = AsyncMock()

            events = []
            async for event in event_generator(
                request=mock_request,
                project_id=uuid4(),
                outline_request=outline_request,
                session=mock_session,
                db=mock_db,
                user=mock_user,
            ):
                events.append(event)

        # Should have checkpoint and complete events for cached content
        assert len(events) == 2
        assert events[0]["event"] == "checkpoint"
        assert events[1]["event"] == "complete"
        assert "cached" in events[1]["data"]


class TestOutlineEndpointValidation:
    """Tests for outline endpoint input validation."""

    @pytest.mark.asyncio
    async def test_stream_outline_user_not_found(self):
        """Test stream_outline returns error when user not found."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import stream_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=str(uuid4()))

        response = await stream_outline(
            project_id=uuid4(),
            request=mock_request,
            brief="A thrilling adventure story",
            db=mock_db,
            user=mock_user,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_stream_outline_brief_too_short(self):
        """Test stream_outline validates brief length minimum."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import stream_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.monthly_budget_usd = 100.0
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_result.scalar.return_value = 0  # No month usage
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_token = TokenData(user_id=str(uuid4()))

        response = await stream_outline(
            project_id=uuid4(),
            request=mock_request,
            brief="short",  # Too short
            db=mock_db,
            user=mock_token,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_stream_outline_target_chapters_too_high(self):
        """Test stream_outline validates target_chapters maximum."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import stream_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.monthly_budget_usd = 100.0
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_result.scalar.return_value = 0
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_token = TokenData(user_id=str(uuid4()))

        response = await stream_outline(
            project_id=uuid4(),
            request=mock_request,
            brief="A valid brief with enough characters for validation",
            target_chapters=100,  # Too high (max 50)
            db=mock_db,
            user=mock_token,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_stream_outline_target_chapters_too_low(self):
        """Test stream_outline validates target_chapters minimum."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import stream_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.monthly_budget_usd = 100.0
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_result.scalar.return_value = 0
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_token = TokenData(user_id=str(uuid4()))

        response = await stream_outline(
            project_id=uuid4(),
            request=mock_request,
            brief="A valid brief with enough characters for validation",
            target_chapters=0,  # Too low (min 1)
            db=mock_db,
            user=mock_token,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_get_outline_project_not_found(self):
        """Test get_outline returns error when project not found."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import get_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=str(uuid4()))

        response = await get_outline(
            project_id=uuid4(),
            request=mock_request,
            db=mock_db,
            user=mock_user,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_outline_no_outline_found(self):
        """Test get_outline returns error when no outline exists."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import get_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        user_id = str(uuid4())
        mock_project = MagicMock()
        mock_project.user_id = user_id

        mock_project_result = MagicMock()
        mock_project_result.scalar_one_or_none.return_value = mock_project

        mock_outline_result = MagicMock()
        mock_outline_result.scalar_one_or_none.return_value = None

        mock_db.execute = AsyncMock(side_effect=[mock_project_result, mock_outline_result])

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=user_id)

        response = await get_outline(
            project_id=uuid4(),
            request=mock_request,
            db=mock_db,
            user=mock_user,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_outline_project_not_found(self):
        """Test update_outline returns error when project not found."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import update_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "PUT"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=str(uuid4()))

        response = await update_outline(
            project_id=uuid4(),
            request=mock_request,
            outline_data={"content": "New outline content"},
            db=mock_db,
            user=mock_user,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_outline_missing_content(self):
        """Test update_outline returns error when content is missing."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import update_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        user_id = str(uuid4())
        mock_project = MagicMock()
        mock_project.user_id = user_id

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_project
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "PUT"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=user_id)

        response = await update_outline(
            project_id=uuid4(),
            request=mock_request,
            outline_data={},  # Missing content
            db=mock_db,
            user=mock_user,
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_revise_outline_project_not_found(self):
        """Test revise_outline_stream returns error when project not found."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import revise_outline_stream
        from app.schemas import OutlineRevision
        from app.security import TokenData

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "POST"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=str(uuid4()))
        revision = OutlineRevision(revision_instructions="Add more conflict in the middle chapters")

        response = await revise_outline_stream(
            project_id=uuid4(),
            request=mock_request,
            revision=revision,
            db=mock_db,
            user=mock_user,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_revise_outline_no_outline_found(self):
        """Test revise_outline_stream returns error when no outline exists."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import revise_outline_stream
        from app.schemas import OutlineRevision
        from app.security import TokenData

        mock_db = AsyncMock()
        user_id = str(uuid4())
        mock_project = MagicMock()
        mock_project.user_id = user_id

        mock_project_result = MagicMock()
        mock_project_result.scalar_one_or_none.return_value = mock_project

        mock_outline_result = MagicMock()
        mock_outline_result.scalar_one_or_none.return_value = None

        mock_db.execute = AsyncMock(side_effect=[mock_project_result, mock_outline_result])

        mock_request = MagicMock(spec=Request)
        mock_request.method = "POST"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=user_id)
        revision = OutlineRevision(revision_instructions="Add more conflict in the middle chapters")

        response = await revise_outline_stream(
            project_id=uuid4(),
            request=mock_request,
            revision=revision,
            db=mock_db,
            user=mock_user,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 404


class TestOutlineSuccessPaths:
    """Tests for successful outline operations."""

    @pytest.mark.asyncio
    async def test_get_outline_success(self):
        """Test get_outline returns outline content successfully."""
        from datetime import datetime, timezone
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import get_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        user_id = str(uuid4())
        mock_project = MagicMock()
        mock_project.user_id = user_id

        mock_artifact = MagicMock()
        mock_artifact.id = uuid4()
        mock_artifact.blob = b"# Book Outline\n\n## Chapter 1"
        mock_artifact.created_at = datetime.now(timezone.utc)
        mock_artifact.meta = {"chapters": 10}

        mock_project_result = MagicMock()
        mock_project_result.scalar_one_or_none.return_value = mock_project

        mock_outline_result = MagicMock()
        mock_outline_result.scalar_one_or_none.return_value = mock_artifact

        mock_db.execute = AsyncMock(side_effect=[mock_project_result, mock_outline_result])

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=user_id)

        response = await get_outline(
            project_id=uuid4(),
            request=mock_request,
            db=mock_db,
            user=mock_user,
        )

        assert response["content"] == "# Book Outline\n\n## Chapter 1"
        assert response["meta"] == {"chapters": 10}

    @pytest.mark.asyncio
    async def test_update_outline_success(self):
        """Test update_outline creates new artifact successfully."""
        from datetime import datetime, timezone
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import update_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        user_id = str(uuid4())
        mock_project = MagicMock()
        mock_project.user_id = user_id

        mock_session = MagicMock()
        mock_session.id = uuid4()

        mock_project_result = MagicMock()
        mock_project_result.scalar_one_or_none.return_value = mock_project

        mock_session_result = MagicMock()
        mock_session_result.scalar_one_or_none.return_value = mock_session

        mock_db.execute = AsyncMock(side_effect=[mock_project_result, mock_session_result])
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        async def mock_refresh(artifact):
            artifact.id = uuid4()
            artifact.created_at = datetime.now(timezone.utc)

        mock_db.refresh = mock_refresh

        mock_request = MagicMock(spec=Request)
        mock_request.method = "PUT"
        mock_request.url.path = "/test"
        mock_user = TokenData(user_id=user_id)

        response = await update_outline(
            project_id=uuid4(),
            request=mock_request,
            outline_data={"content": "Updated outline content"},
            db=mock_db,
            user=mock_user,
        )

        assert response["message"] == "Outline updated successfully"
        assert "id" in response


class TestOutlineIntegration:
    """Integration tests for outline endpoints with TestClient."""

    def test_outline_endpoints_require_auth(self):
        """Test outline endpoints require authentication."""
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)

        project_id = str(uuid4())

        # GET /outline
        response = client.get(f"/api/v1/projects/{project_id}/outline")
        assert response.status_code == 401

    def test_get_outline_requires_auth(self):
        """Test GET /outline requires authentication."""
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)

        project_id = str(uuid4())
        response = client.get(f"/api/v1/projects/{project_id}/outline")

        assert response.status_code == 401

    def test_update_outline_requires_auth(self):
        """Test PUT /outline requires authentication."""
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)

        project_id = str(uuid4())
        response = client.put(
            f"/api/v1/projects/{project_id}/outline",
            json={"content": "New outline"},
        )

        assert response.status_code == 401

    def test_stream_outline_requires_auth(self):
        """Test GET /outline/stream requires authentication."""
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)

        project_id = str(uuid4())
        response = client.get(
            f"/api/v1/projects/{project_id}/outline/stream",
            params={"brief": "A test story"},
        )

        assert response.status_code == 401

    def test_revise_outline_requires_auth(self):
        """Test POST /outline/revise/stream requires authentication."""
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)

        project_id = str(uuid4())
        response = client.post(
            f"/api/v1/projects/{project_id}/outline/revise/stream",
            json={"revision_instructions": "Add more conflict"},
        )

        assert response.status_code == 401


class TestOutlineBudgetChecks:
    """Tests for outline budget validation."""

    @pytest.mark.asyncio
    async def test_stream_outline_budget_exceeded(self):
        """Test stream_outline returns error when budget exceeded."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import BackgroundTasks, Request

        from app.routers.outline import stream_outline
        from app.security import TokenData

        mock_db = AsyncMock()
        user_id = str(uuid4())
        mock_user = MagicMock()
        mock_user.monthly_budget_usd = 50.0  # Budget is $50

        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        mock_usage_result = MagicMock()
        mock_usage_result.scalar.return_value = 60.0  # Usage is $60 (exceeded)

        mock_db.execute = AsyncMock(side_effect=[mock_user_result, mock_usage_result])

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/test"
        mock_token = TokenData(user_id=user_id)

        response = await stream_outline(
            project_id=uuid4(),
            request=mock_request,
            brief="A valid brief with enough characters for validation",
            db=mock_db,
            user=mock_token,
            background_tasks=BackgroundTasks(),
        )

        assert response.status_code == 403


class TestRevisionEventGenerator:
    """Tests for revision event generator behavior."""

    @pytest.mark.asyncio
    async def test_revision_event_generator_starts_correctly(self):
        """Test revision_event_generator emits initial checkpoint."""
        from unittest.mock import AsyncMock, MagicMock

        from fastapi import Request

        from app.routers.outline import revision_event_generator
        from app.schemas import OutlineRevision
        from app.security import TokenData

        mock_request = MagicMock(spec=Request)
        mock_request.is_disconnected = AsyncMock(return_value=True)  # Disconnect immediately

        mock_artifact = MagicMock()
        mock_artifact.blob = b"Original outline content"
        mock_artifact.id = uuid4()

        mock_session = MagicMock()
        mock_session.id = uuid4()
        mock_db = AsyncMock()
        mock_user = TokenData(user_id=str(uuid4()))
        revision = OutlineRevision(revision_instructions="Add more conflict")

        events = []
        async for event in revision_event_generator(
            request=mock_request,
            project_id=uuid4(),
            revision=revision,
            current_outline=mock_artifact,
            session=mock_session,
            db=mock_db,
            user=mock_user,
        ):
            events.append(event)

        # Should have initial checkpoint
        assert len(events) >= 1
        assert events[0]["event"] == "checkpoint"
