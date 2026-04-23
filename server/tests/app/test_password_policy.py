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

from app.shared.auth.password_policy import (
    COMMON_PASSWORDS,
    PasswordStrengthResult,
    validate_password_strength,
)


def test_validate_password_strength_returns_named_tuple():
    result = validate_password_strength("ValidPass123")
    assert isinstance(result, PasswordStrengthResult)
    assert hasattr(result, "valid")
    assert hasattr(result, "reason")


def test_validate_password_strength_valid_password():
    result = validate_password_strength("ValidPass123")
    assert result.valid is True
    assert result.reason == ""


def test_validate_password_strength_too_short():
    result = validate_password_strength("short")
    assert result.valid is False
    assert result.reason == "Password must be at least 8 characters long"


def test_validate_password_strength_exactly_8_chars():
    result = validate_password_strength("Pass1234")
    assert result.valid is True
    assert result.reason == ""


def test_validate_password_strength_empty_string():
    result = validate_password_strength("")
    assert result.valid is False
    assert result.reason == "Password must be at least 8 characters long"


def test_validate_password_strength_no_letters():
    result = validate_password_strength("12345678")
    assert result.valid is False
    assert result.reason == "Password must contain at least one letter"


def test_validate_password_strength_no_digits():
    result = validate_password_strength("abcdefgh")
    assert result.valid is False
    assert result.reason == "Password must contain at least one digit"


def test_validate_password_strength_common_password():
    # "password" fails at the digit check before reaching common-password check
    result = validate_password_strength("password")
    assert result.valid is False
    assert result.reason == "Password must contain at least one digit"


def test_validate_password_strength_common_password_case_insensitive():
    # "PASSWORD" fails at the digit check before reaching common-password check
    result = validate_password_strength("PASSWORD")
    assert result.valid is False
    assert result.reason == "Password must contain at least one digit"


def test_validate_password_strength_common_password_mixed_case():
    # "Password1" is in the common-password list and has letters + digits
    result = validate_password_strength("Password1")
    assert result.valid is False
    assert result.reason == "Password is too common; choose a stronger password"


def test_validate_password_strength_password123():
    result = validate_password_strength("password123")
    assert result.valid is False
    assert result.reason == "Password is too common; choose a stronger password"


def test_validate_password_strength_admin():
    result = validate_password_strength("admin")
    assert result.valid is False
    assert result.reason == "Password must be at least 8 characters long"


def test_validate_password_strength_qwerty():
    result = validate_password_strength("qwerty")
    assert result.valid is False
    assert result.reason == "Password must be at least 8 characters long"


def test_validate_password_strength_common_set_includes():
    assert "123456" in COMMON_PASSWORDS
    assert "password" in COMMON_PASSWORDS
    assert "qwerty" in COMMON_PASSWORDS
    assert "Password123" in COMMON_PASSWORDS
    assert "P@ssword1" in COMMON_PASSWORDS


def test_validate_password_strength_common_set_is_frozenset():
    assert isinstance(COMMON_PASSWORDS, frozenset)


def test_validate_password_strength_valid_with_special_chars():
    result = validate_password_strength("P@ssw0rd!123")
    assert result.valid is True
    assert result.reason == ""


def test_validate_password_strength_valid_with_unicode():
    result = validate_password_strength("密码123abc")
    assert result.valid is True
    assert result.reason == ""


def test_validate_password_strength_valid_long_password():
    result = validate_password_strength("a" * 100 + "1" + "a")
    assert result.valid is True
    assert result.reason == ""


def test_validate_password_strength_digit_only_after_8():
    result = validate_password_strength("abcdefgh1")
    assert result.valid is True
    assert result.reason == ""


def test_validate_password_strength_letter_only_after_8():
    result = validate_password_strength("1234567a")
    assert result.valid is True
    assert result.reason == ""


def test_password_strength_result_named_tuple_fields():
    result = PasswordStrengthResult(valid=True, reason="")
    assert result.valid is True
    assert result.reason == ""


def test_password_strength_result_invalid_has_reason():
    result = PasswordStrengthResult(valid=False, reason="test reason")
    assert result.valid is False
    assert result.reason == "test reason"
