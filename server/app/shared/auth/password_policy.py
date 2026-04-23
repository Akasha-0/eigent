# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

"""
Password strength validation utilities for authentication endpoints.

Enforces minimum length, character diversity, and common password rejection
to reduce brute-force and credential-stuffing risk.
"""

from typing import NamedTuple

# Common weak passwords frequently used in credential stuffing attacks.
# Includes top entries from public breach databases (e.g., HaveIBeenPwned top 10k).
COMMON_PASSWORDS: frozenset[str] = frozenset({
    "123456",
    "password",
    "12345678",
    "qwerty",
    "123456789",
    "1234567",
    "12345",
    "iloveyou",
    "adobe123",
    "admin",
    "1234567890",
    "letmein",
    "welcome",
    "monkey",
    "dragon",
    "master",
    "login",
    "abc123",
    "passw0rd",
    "hello",
    "football",
    "shadow",
    "sunshine",
    "princess",
    "trustno1",
    "_ACCESS",
    "ACCESS",
    "Password1",
    "Password123",
    "admin123",
    "administrator",
    "root",
    "toor",
    "qwer1234",
    "asdf1234",
    "zxcvbnm",
    " FuckYou!123",
    "FuckYou123",
    "password1",
    "p@ssword",
    "p@ssw0rd",
    "password!",
    "Password!",
    "P@ssword1",
    "P@ssword123",
    "Password12",
    "Password123!",
    "P4ssword!",
    "P4ssw0rd!",
    "1q2w3e4r",
    "1q2w3e4r5t",
    "1q2w3e4r5t6y",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
    "abcd1234",
    "111111",
    "000000",
    "121212",
    "password123",
    "password!@#",
    "changeme",
    "welcome1",
    "welcome123",
    "winter2023",
    "spring2023",
    "summer2023",
    "autumn2023",
    "winter2024",
    "spring2024",
    "summer2024",
    "autumn2024",
    "winter2025",
    "spring2025",
    "summer2025",
    "autumn2025",
    "Password2024",
    "Password2025",
    "Pa$$w0rd123",
    "Pa$$word1",
})


class PasswordStrengthResult(NamedTuple):
    """Result of password strength validation."""

    valid: bool
    reason: str


def validate_password_strength(password: str, /) -> PasswordStrengthResult:
    """
    Validate password against strength requirements.

    Checks:
    - Minimum 8 characters
    - At least one letter (a-z, A-Z)
    - At least one digit (0-9)
    - Not in the common passwords list (case-insensitive)

    Args:
        password: The plaintext password string to validate.

    Returns:
        PasswordStrengthResult with ``valid=True`` on success or
        ``valid=False`` with a descriptive ``reason`` on failure.

    Examples::

        >>> result = validate_password_strength("MyP@ssw0rd!")
        >>> result.valid
        True

        >>> result = validate_password_strength("123456")
        >>> result.valid
        False
        >>> result.reason
        'Password must be at least 8 characters long'
    """
    if not password or len(password) < 8:
        return PasswordStrengthResult(False, "Password must be at least 8 characters long")

    if not any(c.isalpha() for c in password):
        return PasswordStrengthResult(False, "Password must contain at least one letter")

    if not any(c.isdigit() for c in password):
        return PasswordStrengthResult(False, "Password must contain at least one digit")

    if password.lower() in COMMON_PASSWORDS:
        return PasswordStrengthResult(False, "Password is too common; choose a stronger password")

    return PasswordStrengthResult(valid=True, reason="")