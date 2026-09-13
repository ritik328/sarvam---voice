from __future__ import annotations

import re


# Sentence-ending punctuation patterns
_SENTENCE_END = re.compile(r'(?<=[.!?])\s+')
_CLAUSE_BREAK = re.compile(r'(?<=[,;:])\s+')
_STREAMING_FIRST_BREAK = re.compile(r'([.!?]+[\s\n]+|[,;:—]+[\s\n]+)')
_STREAMING_SENTENCE_BREAK = re.compile(r'([.!?]+[\s\n]+)')


def extract_streaming_chunk(
    buffer: str,
    is_first: bool,
    min_first_chars: int = 12,
    max_chars: int = 300,
) -> tuple[str | None, str]:
    """
    Extract the next synthesizable chunk from an in-flight streaming text buffer.

    For the first chunk, allows splitting at natural clause boundaries (,;:—)
    after min_first_chars to achieve ultra-low TTFAR. For subsequent chunks,
    splits primarily at sentence boundaries (.!?), falling back to clause or
    word boundaries if max_chars is reached.

    Returns:
      (chunk_text, remaining_buffer) where chunk_text is None if no complete
      boundary has been reached yet.
    """
    if not buffer.strip():
        return None, buffer

    pattern = _STREAMING_FIRST_BREAK if is_first else _STREAMING_SENTENCE_BREAK
    for m in pattern.finditer(buffer):
        end_idx = m.end()
        chunk = buffer[:end_idx].strip()
        punct = m.group(1).strip()
        # For first chunk with a clause break, ensure we have at least min_first_chars
        if is_first and any(p in punct for p in ",;:—") and len(chunk) < min_first_chars:
            continue
        remaining = buffer[end_idx:]
        return chunk, remaining

    # Fallback if buffer has grown long without sentence punctuation
    if len(buffer) >= max_chars:
        for m in _CLAUSE_BREAK.finditer(buffer[:max_chars]):
            end_idx = m.end()
            return buffer[:end_idx].strip(), buffer[end_idx:]
        idx = buffer.rfind(" ", 0, max_chars)
        if idx > 0:
            return buffer[:idx].strip(), buffer[idx:]
        return buffer[:max_chars].strip(), buffer[max_chars:]

    return None, buffer


def chunk_text(text: str, max_chars: int = 450) -> list[str]:
    """
    Split text into TTS-ready chunks.

    Strategy:
      1. Split at sentence boundaries first (.!?)
      2. If a sentence is still too long, split at clause boundaries (,;:)
      3. If still too long, split at word boundaries
      4. Never split mid-word
      5. Never produce a chunk longer than max_chars
    """
    if not text.strip():
        return []

    chunks: list[str] = []
    # First pass: sentence boundaries
    sentences = _SENTENCE_END.split(text)

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= max_chars:
            chunks.append(sentence)
        else:
            # Split at clause boundaries
            clauses = _CLAUSE_BREAK.split(sentence)
            current = ""
            for clause in clauses:
                clause = clause.strip()
                if not clause:
                    continue
                candidate = (current + " " + clause).strip() if current else clause
                if len(candidate) <= max_chars:
                    current = candidate
                else:
                    if current:
                        chunks.append(current)
                    # If the clause itself is too long, split at words
                    if len(clause) > max_chars:
                        word_chunks = _split_at_words(clause, max_chars)
                        chunks.extend(word_chunks[:-1])
                        current = word_chunks[-1] if word_chunks else ""
                    else:
                        current = clause
            if current:
                chunks.append(current)

    return [c for c in chunks if c.strip()]


def _split_at_words(text: str, max_chars: int) -> list[str]:
    """Last-resort word-boundary splitting."""
    words = text.split()
    chunks: list[str] = []
    current = ""
    for word in words:
        candidate = (current + " " + word).strip() if current else word
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = word
    if current:
        chunks.append(current)
    return chunks
