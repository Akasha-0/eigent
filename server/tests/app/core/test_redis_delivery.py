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

"""Tests for RedisSessionManager delivery confirmation methods."""

from unittest.mock import MagicMock, patch


class TestDeliveryChannelKey:
    """Tests for _delivery_channel_key()."""

    def test_channel_key_format(self):
        from app.core.redis_utils import RedisSessionManager
        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        result = manager._delivery_channel_key("exec-123")
        assert result == "ws:delivery:exec-123"


class TestConfirmDeliveryPush:
    """Tests for confirm_delivery_push()."""

    def test_publishes_to_redis_channel(self):
        from app.core.redis_utils import RedisSessionManager
        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        manager._client = MagicMock()

        result = manager.confirm_delivery_push("exec-abc", "session-xyz")

        assert result is True
        manager._client.publish.assert_called_once()
        call_args = manager._client.publish.call_args
        assert call_args[0][0] == "ws:delivery:exec-abc"
        payload = call_args[0][1]
        import json
        parsed = json.loads(payload)
        assert parsed["execution_id"] == "exec-abc"
        assert parsed["session_id"] == "session-xyz"
        assert "delivered_at" in parsed

    def test_returns_false_on_redis_error(self):
        from app.core.redis_utils import RedisSessionManager
        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        manager._client = MagicMock()
        manager._client.publish.side_effect = RuntimeError("connection refused")

        result = manager.confirm_delivery_push("exec-123", "session-456")

        assert result is False


class TestConfirmDelivery:
    """Tests for confirm_delivery()."""

    def test_stores_confirmation_with_ttl(self):
        from app.core.redis_utils import RedisSessionManager
        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        manager._client = MagicMock()

        result = manager.confirm_delivery("exec-001", "session-002")

        assert result is True
        manager._client.setex.assert_called_once()
        setex_args = manager._client.setex.call_args
        assert setex_args[0][0] == "ws:delivery:exec-001"
        assert setex_args[0][1] == 300  # DELIVERY_TTL
        import json
        parsed = json.loads(setex_args[0][2])
        assert parsed["execution_id"] == "exec-001"
        assert parsed["session_id"] == "session-002"

    def test_also_pushes_to_list_for_blpop(self):
        from app.core.redis_utils import RedisSessionManager
        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        manager._client = MagicMock()

        manager.confirm_delivery("exec-003", "session-004")

        manager._client.rpush.assert_called_once()
        rpush_args = manager._client.rpush.call_args
        assert rpush_args[0][0] == "ws:delivery:exec-003"
        import json
        parsed = json.loads(rpush_args[0][1])
        assert parsed["execution_id"] == "exec-003"

    def test_returns_false_on_redis_error(self):
        from app.core.redis_utils import RedisSessionManager
        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        manager._client = MagicMock()
        manager._client.setex.side_effect = RuntimeError("connection refused")

        result = manager.confirm_delivery("exec-999", "session-999")

        assert result is False


class TestWaitForDeliveryAsync:
    """Tests for wait_for_delivery_async()."""

    def test_returns_confirmation_on_delivery(self):
        from app.core.redis_utils import RedisSessionManager
        import json
        from unittest.mock import AsyncMock

        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        mock_async_client = MagicMock()
        manager._async_client = mock_async_client

        confirmation_payload = json.dumps({
            "execution_id": "exec-async-1",
            "session_id": "session-async-1",
            "delivered_at": "2026-01-01T00:00:00Z"
        })
        mock_async_client.lpush = AsyncMock(return_value=1)
        mock_async_client.blpop = AsyncMock(
            return_value=("ws:delivery:exec-async-1", confirmation_payload)
        )
        mock_async_client.delete = AsyncMock()

        import asyncio

        async def run():
            result = await manager.wait_for_delivery_async("exec-async-1", timeout=5.0)
            assert result is not None
            assert result["execution_id"] == "exec-async-1"
            assert result["session_id"] == "session-async-1"
            mock_async_client.delete.assert_called_once_with("ws:delivery:exec-async-1")

        asyncio.run(run())

    def test_returns_none_on_timeout(self):
        from app.core.redis_utils import RedisSessionManager

        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        mock_async_client = MagicMock()
        manager._async_client = mock_async_client

        mock_async_client.lpush = MagicMock(return_value=MagicMock())
        mock_async_client.blpop = MagicMock(return_value=None)
        mock_async_client.lrem = MagicMock()

        import asyncio

        async def run():
            result = await manager.wait_for_delivery_async("exec-timeout-1", timeout=0.1)
            assert result is None

        asyncio.run(run())

    def test_skips_sentinel_on_blpop_result(self):
        from app.core.redis_utils import RedisSessionManager

        manager = RedisSessionManager(redis_url="redis://localhost:6379/0")
        mock_async_client = MagicMock()
        manager._async_client = mock_async_client

        mock_async_client.lpush = MagicMock(return_value=MagicMock())
        mock_async_client.blpop = MagicMock(return_value=("key", "__sentinel:abc-123"))
        mock_async_client.delete = MagicMock()

        import asyncio

        async def run():
            result = await manager.wait_for_delivery_async("exec-sentinel-1", timeout=0.1)
            assert result is None
            mock_async_client.delete.assert_not_called()

        asyncio.run(run())