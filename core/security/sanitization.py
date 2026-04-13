"""
core/security/sanitization.py - Input Sanitization for Ensemble

Protects against XSS and injection attacks by sanitizing user input
before storage or rendering.

Usage:
    from core.security.sanitization import sanitize_input

    # Sanitize text before storing
    clean_text = sanitize_input(user_input)

    # Sanitize HTML content
    clean_html = sanitize_html(user_html)
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def sanitize_input(text: str, max_length: int = 10000) -> str:
    """
    Sanitize user input text for safe storage.

    - Strips HTML tags
    - Removes null bytes
    - Enforces max length
    - Normalizes whitespace

    Args:
        text: User input to sanitize
        max_length: Maximum allowed length (default 10000)

    Returns:
        Sanitized text safe for storage
    """
    if not text:
        return ""

    # Remove null bytes
    text = text.replace('\x00', '')

    # Strip HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    # Enforce max length
    if len(text) > max_length:
        text = text[:max_length]
        logger.warning("⚠️ [Sanitization] Input truncated to %d characters", max_length)

    return text


def sanitize_html(html_content: str, max_length: int = 50000) -> str:
    """
    Sanitize HTML content, allowing only safe tags.

    Allowed tags: b, i, em, strong, u, p, br, ul, ol, li, a, code, pre
    All other tags are stripped.
    Attributes are removed except href on <a> tags.

    Args:
        html_content: HTML content to sanitize
        max_length: Maximum allowed length

    Returns:
        Sanitized HTML safe for rendering
    """
    try:
        import bleach

        allowed_tags = [
            'b', 'i', 'em', 'strong', 'u', 'p', 'br',
            'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote',
        ]
        allowed_attributes = {
            'a': ['href', 'title'],
        }

        if len(html_content) > max_length:
            html_content = html_content[:max_length]
            logger.warning("⚠️ [Sanitization] HTML truncated to %d characters", max_length)

        return bleach.clean(
            html_content,
            tags=allowed_tags,
            attributes=allowed_attributes,
            strip=True,
        )
    except ImportError:
        logger.warning("⚠️ [Sanitization] bleach not installed, using basic sanitization")
        return sanitize_input(html_content, max_length)


def validate_filename(filename: str) -> Optional[str]:
    """
    Validate and sanitize a user-uploaded filename.

    - Removes path traversal sequences
    - Allows only alphanumeric, hyphens, underscores, dots
    - Enforces max length of 255 characters
    - Blocks executable extensions

    Args:
        filename: User-provided filename

    Returns:
        Sanitized filename or None if invalid
    """
    if not filename:
        return None

    # Remove path traversal
    filename = filename.replace('../', '').replace('..\\', '')

    # Remove leading dots and slashes
    filename = filename.lstrip('./\\')

    # Check for dangerous extensions
    dangerous_extensions = {
        'exe', 'bat', 'cmd', 'com', 'sh', 'bash', 'zsh',
        'ps1', 'vbs', 'js', 'py', 'rb', 'pl', 'php',
        'dll', 'so', 'dylib', 'app', 'dmg', 'pkg',
    }
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext in dangerous_extensions:
        logger.warning("⚠️ [Sanitization] Blocked dangerous filename extension: .%s", ext)
        return None

    # Allow only safe characters
    if not re.match(r'^[a-zA-Z0-9_\-. ]+$', filename):
        # Try to extract safe characters only
        filename = re.sub(r'[^a-zA-Z0-9_\-. ]', '', filename)

    # Enforce max length
    if len(filename) > 255:
        name, ext_part = filename.rsplit('.', 1) if '.' in filename else (filename, '')
        filename = name[:255 - len(ext_part) - 1] + ('.' + ext_part if ext_part else '')

    return filename.strip() if filename else None


def validate_url(url: str) -> Optional[str]:
    """
    Validate a user-provided URL.

    - Must start with http:// or https://
    - Blocks localhost/internal IPs
    - Max length 2048 characters

    Args:
        url: User-provided URL

    Returns:
        Validated URL or None if invalid
    """
    if not url:
        return None

    if len(url) > 2048:
        return None

    # Must be http or https
    if not url.startswith(('http://', 'https://')):
        return None

    # Block localhost and internal IPs
    blocked_patterns = [
        'localhost', '127.0.0.1', '0.0.0.0',
        '10.', '172.16.', '172.17.', '172.18.', '172.19.',
        '172.20.', '172.21.', '172.22.', '172.23.',
        '172.24.', '172.25.', '172.26.', '172.27.',
        '172.28.', '172.29.', '172.30.', '172.31.',
        '192.168.', '169.254.',
    ]
    url_lower = url.lower()
    for pattern in blocked_patterns:
        if pattern in url_lower:
            logger.warning("⚠️ [Sanitization] Blocked internal URL: %s", url[:50])
            return None

    return url
