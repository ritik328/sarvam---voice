import pytest
from app.server.sessions.store import SessionStore, SessionPhase


@pytest.mark.asyncio
async def test_create_session():
    store = SessionStore()
    state = await store.create("test-123")
    assert state.session_id == "test-123"
    assert state.phase == SessionPhase.IDLE


@pytest.mark.asyncio
async def test_get_session():
    store = SessionStore()
    await store.create("abc")
    state = await store.get("abc")
    assert state is not None
    assert state.session_id == "abc"


@pytest.mark.asyncio
async def test_get_nonexistent_session():
    store = SessionStore()
    state = await store.get("nonexistent")
    assert state is None


@pytest.mark.asyncio
async def test_delete_session():
    store = SessionStore()
    await store.create("to-delete")
    await store.delete("to-delete")
    state = await store.get("to-delete")
    assert state is None


@pytest.mark.asyncio
async def test_new_turn_resets_ids():
    store = SessionStore()
    state = await store.create("s1")
    turn_id_1 = state.new_turn()
    turn_id_2 = state.new_turn()
    assert turn_id_1 != turn_id_2
    assert state.response_id == ""


@pytest.mark.asyncio
async def test_cancel_sets_event():
    store = SessionStore()
    state = await store.create("s2")
    state.new_turn()
    assert not state.cancel_event.is_set()
    state.cancel()
    assert state.cancel_event.is_set()


@pytest.mark.asyncio
async def test_new_turn_creates_fresh_cancel_event():
    store = SessionStore()
    state = await store.create("s3")
    state.new_turn()
    state.cancel()
    assert state.cancel_event.is_set()
    # After a new turn, cancel event should be fresh
    state.new_turn()
    assert not state.cancel_event.is_set()
