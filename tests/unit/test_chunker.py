from app.server.services.chunker import chunk_text


def test_empty_text_returns_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_short_text_single_chunk():
    result = chunk_text("Hello, world!", max_chars=450)
    assert result == ["Hello, world!"]


def test_splits_at_sentence_boundary():
    text = "First sentence. Second sentence. Third sentence."
    result = chunk_text(text, max_chars=450)
    # Chunker splits at sentence boundaries; each sentence becomes its own chunk
    assert len(result) == 3
    assert result[0] == "First sentence."
    assert result[1] == "Second sentence."
    assert result[2] == "Third sentence."


def test_splits_long_sentences():
    # Each sentence > 30 chars, force split at max_chars=30
    text = "This is a fairly long first sentence here. And this is another long sentence too."
    result = chunk_text(text, max_chars=30)
    assert all(len(c) <= 30 for c in result)


def test_no_midword_split():
    text = "supercalifragilisticexpialidocious is a very long word"
    result = chunk_text(text, max_chars=20)
    for chunk in result:
        # No chunk should be a partial word
        assert chunk == chunk.strip()
        words = chunk.split()
        for word in words:
            assert word in text


def test_strips_whitespace():
    text = "  Hello there.  How are you?  "
    result = chunk_text(text, max_chars=450)
    for chunk in result:
        assert chunk == chunk.strip()


def test_max_chars_enforced():
    max_chars = 50
    text = "Word " * 100  # 500 chars
    result = chunk_text(text, max_chars=max_chars)
    for chunk in result:
        assert len(chunk) <= max_chars


def test_clause_boundary_fallback():
    # Long sentence with comma breaks
    text = "First clause here, second clause there, third clause indeed, fourth clause exists."
    result = chunk_text(text, max_chars=25)
    for chunk in result:
        assert len(chunk) <= 25


def test_extract_streaming_chunk_first_chunk():
    from app.server.services.chunker import extract_streaming_chunk

    buffer = "It is 7:13 PM on Sunday, September 13th, 2026."
    chunk, rem = extract_streaming_chunk(buffer, is_first=True, min_first_chars=12)
    assert chunk == "It is 7:13 PM on Sunday,"
    assert "September 13th" in rem

    chunk2, rem2 = extract_streaming_chunk(rem, is_first=False)
    assert chunk2 is None  # no trailing punctuation with space in rem yet
    assert "September 13th, 2026." in rem2


def test_extract_streaming_chunk_sentence():
    from app.server.services.chunker import extract_streaming_chunk

    buffer = "Sure! I can help you with that. Just let me know."
    chunk1, rem1 = extract_streaming_chunk(buffer, is_first=True)
    assert chunk1 == "Sure!"
    chunk2, rem2 = extract_streaming_chunk(rem1, is_first=False)
    assert chunk2 == "I can help you with that."

