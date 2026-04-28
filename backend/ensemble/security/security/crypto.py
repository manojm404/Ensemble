"""
core/security/crypto.py - Encryption Utilities for Ensemble

Provides AES-256 encryption (via Fernet) for sensitive data storage:
- LLM API keys
- User secrets
- Any data that needs encryption at rest

Usage:
    from core.security.crypto import encrypt_api_key, decrypt_api_key

    # Encrypt before storing in Supabase
    encrypted = encrypt_api_key("sk-abc123...")

    # Decrypt when needed for API calls
    plaintext = decrypt_api_key(encrypted)

Environment:
    API_KEY_ENCRYPTION_KEY - Fernet key (generate with Fernet.generate_key())
"""

import os
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

# Lazy-initialized Fernet instance
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Get or create the Fernet encryption instance."""
    global _fernet
    if _fernet is not None:
        return _fernet

    key = os.getenv("API_KEY_ENCRYPTION_KEY")
    if not key:
        raise ValueError(
            "API_KEY_ENCRYPTION_KEY environment variable is required. "
            "Generate one with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )

    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        return _fernet
    except Exception as e:
        raise ValueError(
            f"Invalid API_KEY_ENCRYPTION_KEY. Must be a valid Fernet key. Error: {e}"
        ) from e


def encrypt_api_key(plaintext: str) -> str:
    """
    Encrypt an API key for storage.

    Args:
        plaintext: The raw API key (e.g., "sk-abc123...")

    Returns:
        Encrypted string (safe to store in database)
    """
    if not plaintext:
        raise ValueError("Cannot encrypt empty key")

    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    """
    Decrypt a stored API key.

    Args:
        encrypted: The encrypted key from database

    Returns:
        Original plaintext API key

    Raises:
        ValueError: If decryption fails (wrong key or corrupted data)
    """
    if not encrypted:
        raise ValueError("Cannot decrypt empty value")

    fernet = _get_fernet()
    try:
        return fernet.decrypt(encrypted.encode()).decode()
    except InvalidToken as e:
        logger.error("Failed to decrypt API key: wrong encryption key or corrupted data")
        raise ValueError("Failed to decrypt API key. Encryption key may have changed.") from e


def mask_key(key: str, visible_chars: int = 4) -> str:
    """
    Mask an API key for display (show only last N characters).

    Args:
        key: The plaintext or encrypted key
        visible_chars: Number of trailing characters to show

    Returns:
        Masked key string (e.g., "...abc123")
    """
    if not key:
        return ""
    if len(key) <= visible_chars:
        return key
    return f"...{key[-visible_chars:]}"


def generate_encryption_key() -> str:
    """
    Generate a new Fernet encryption key.

    Use this to create the API_KEY_ENCRYPTION_KEY env var.

    Returns:
        Base64-encoded Fernet key string
    """
    return Fernet.generate_key().decode()
