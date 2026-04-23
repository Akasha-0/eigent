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

"""Tests to verify error messages in proxy_controller do not expose internal details.

Ensures that sensitive information such as exception types, file paths, library
names, API keys, or stack traces are never leaked to clients via HTTP responses.
"""

from unittest.mock import patch, MagicMock

import pytest
from fastapi import HTTPException

from app.domains.mcp.api.proxy_controller import exa_search, google_search
from app.model.mcp.proxy import ExaSearch


class TestExaSearchErrorHandling:
    """Tests for exa_search error message sanitization.

    Verifies that when the Exa API raises an exception, the client receives
    only a generic "Internal server error" message without internal details.
    """

    def _mock_key_dependency(self) -> MagicMock:
        """Create a mock key dependency to bypass auth."""
        mock_key = MagicMock()
        mock_key.id = "test-user-id"
        return mock_key

    def test_exa_search_exception_does_not_leak_exception_type(self):
        """A raised exception must not reveal the exception class name."""
        with patch("app.domains.mcp.api.proxy_controller.Exa") as mock_exa_class:
            mock_exa = MagicMock()
            mock_exa.search.side_effect = RuntimeError("exa lib error")
            mock_exa_class.return_value = mock_exa

            search_params = ExaSearch(query="test query")
            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                exa_search(search_params, mock_key)

            assert exc_info.value.status_code == 500
            detail = exc_info.value.detail
            assert detail == "Internal server error"
            # The exception type name must not appear in the response
            assert "RuntimeError" not in detail
            assert "exa" not in detail.lower()

    def test_exa_search_exception_does_not_leak_library_name(self):
        """The library name (exa_py) must not appear in error responses."""
        with patch("app.domains.mcp.api.proxy_controller.Exa") as mock_exa_class:
            mock_exa = MagicMock()
            mock_exa.search.side_effect = ConnectionError("exa connection failed")
            mock_exa_class.return_value = mock_exa

            search_params = ExaSearch(query="test query")
            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                exa_search(search_params, mock_key)

            detail = exc_info.value.detail.lower()
            assert "exa" not in detail
            assert "connection" not in detail

    def test_exa_search_exception_does_not_leak_stack_trace(self):
        """No stack trace or file path information must be in the response."""
        with patch("app.domains.mcp.api.proxy_controller.Exa") as mock_exa_class:
            mock_exa = MagicMock()
            mock_exa.search.side_effect = ValueError("/path/to/file.py line 42")
            mock_exa_class.return_value = mock_exa

            search_params = ExaSearch(query="test query")
            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                exa_search(search_params, mock_key)

            detail = exc_info.value.detail
            assert "line " not in detail
            assert ".py" not in detail
            assert "FileNotFoundError" not in detail
            assert "Traceback" not in detail

    def test_exa_search_exception_does_not_leak_api_key(self):
        """API key values must never be exposed in error messages."""
        with patch("app.domains.mcp.api.proxy_controller.Exa") as mock_exa_class:
            mock_exa = MagicMock()
            # Simulate an error message that could contain the API key
            mock_exa.search.side_effect = Exception(
                "Invalid API key sk-1234567890abcdef: token is invalid"
            )
            mock_exa_class.return_value = mock_exa

            search_params = ExaSearch(query="test query")
            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                exa_search(search_params, mock_key)

            detail = exc_info.value.detail
            assert "sk-1234567890abcdef" not in detail
            assert "API" not in detail
            assert "key" not in detail.lower()

    def test_exa_search_exception_does_not_leak_internal_error_string(self):
        """The original error string from the exception must not be returned."""
        with patch("app.domains.mcp.api.proxy_controller.Exa") as mock_exa_class:
            mock_exa = MagicMock()
            mock_exa.search.side_effect = Exception(
                "Quota exceeded for project my-project-123"
            )
            mock_exa_class.return_value = mock_exa

            search_params = ExaSearch(query="test query")
            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                exa_search(search_params, mock_key)

            detail = exc_info.value.detail
            # None of the specific error text should leak
            assert "Quota" not in detail
            assert "exceeded" not in detail
            assert "project" not in detail
            assert "my-project-123" not in detail

    def test_exa_search_and_contents_exception_sanitized(self):
        """search_and_contents path must also sanitize error messages."""
        with patch("app.domains.mcp.api.proxy_controller.Exa") as mock_exa_class:
            mock_exa = MagicMock()
            mock_exa.search_and_contents.side_effect = TimeoutError(
                "Request timed out after 30s"
            )
            mock_exa_class.return_value = mock_exa

            search_params = ExaSearch(query="test query", text=True)
            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                exa_search(search_params, mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            assert "timed out" not in detail
            assert "30s" not in detail


class TestGoogleSearchErrorHandling:
    """Tests for google_search error message sanitization.

    Verifies that when the Google Custom Search API call fails, the client
    receives only a generic "Internal server error" message without exposing
    API keys, error codes, or internal details.
    """

    def _mock_key_dependency(self) -> MagicMock:
        """Create a mock key dependency to bypass auth."""
        mock_key = MagicMock()
        mock_key.id = "test-user-id"
        return mock_key

    def test_google_search_http_error_does_not_leak_api_key(self):
        """HTTP errors must not expose the Google API key."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "error": {
                    "code": 403,
                    "message": "API key is invalid. Key: AIzaSyDEADBEEF123456789",
                }
            }
            mock_get.return_value = mock_response

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="web", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            # The API key must not appear in the response
            assert "AIzaSyDEADBEEF123456789" not in detail
            assert "API key" not in detail

    def test_google_search_error_info_dict_not_leaked(self):
        """The Google API error info dict must not be returned to the client."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "error": {
                    "code": 429,
                    "message": "Quota exceeded",
                    "status": "RESOURCE_EXHAUSTED",
                }
            }
            mock_get.return_value = mock_response

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="web", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            assert "429" not in detail
            assert "Quota" not in detail
            assert "RESOURCE_EXHAUSTED" not in detail
            assert "exceeded" not in detail

    def test_google_search_request_exception_sanitized(self):
        """requests.RequestException details must not be exposed."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_get.side_effect = Exception("ConnectionRefusedError: connection to 192.168.1.1:8080 refused")

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="web", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            assert "ConnectionRefusedError" not in detail
            assert "192.168.1.1" not in detail
            assert "8080" not in detail
            assert "refused" not in detail

    def test_google_search_timeout_error_sanitized(self):
        """Timeout errors must not reveal timing details."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_get.side_effect = Exception("ReadTimeout: HTTPSConnectionPool(host='google.com', port=443)")

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="web", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            assert "ReadTimeout" not in detail
            assert "HTTPSConnectionPool" not in detail
            assert "google.com" not in detail

    def test_google_search_no_items_and_no_error_info(self):
        """When 'items' is absent with no error key, a generic error is returned."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "searchInformation": {"totalResults": "0"}
            }
            mock_get.return_value = mock_response

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="web", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"

    def test_google_search_generic_exception_not_leaked(self):
        """A generic Exception raised during request must not expose its message."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_get.side_effect = Exception("something went wrong in the internal service")

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="web", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            assert "something went wrong" not in detail
            assert "internal service" not in detail

    def test_google_search_image_type_error_sanitized(self):
        """Errors during image search type must also be sanitized."""
        with patch("app.domains.mcp.api.proxy_controller.requests.get") as mock_get:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "error": {
                    "code": 500,
                    "message": "Internal error in image search service",
                }
            }
            mock_get.return_value = mock_response

            mock_key = self._mock_key_dependency()

            with pytest.raises(HTTPException) as exc_info:
                google_search(query="test", search_type="image", key=mock_key)

            detail = exc_info.value.detail
            assert detail == "Internal server error"
            assert "image" not in detail.lower()
            assert "500" not in detail
            assert "Internal error" not in detail