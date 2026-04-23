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

"""Redis utilities for managing WebSocket sessions and real-time data."""

import redis
from redis import Redis
from typing import Optional, Dict, Any, Set, Callable
from datetime import datetime, timezone
import json
import logging
import os
import asyncio

logger = logging.getLogger("server_redis_utils")


class RedisSessionManager:
    """Manages WebSocket sessions in Redis for scalability and persistence."""
    
    def __init__(self, redis_url: Optional[str] = None):
        """Initialize Redis connection.
        
        Args:
            redis_url: Redis connection URL. If None, reads from environment.
        """
        self.redis_url = redis_url or os.getenv("SESSION_REDIS_URL", "redis://localhost:6379/0")
        self._client: Optional[Redis] = None
        
        # Key prefixes
        self.SESSION_PREFIX = "ws:session:"
        self.USER_SESSIONS_PREFIX = "ws:user:sessions:"
        self.PENDING_PREFIX = "ws:pending:"
        self.PUBSUB_CHANNEL = "ws:executions"
        self.DELIVERY_CONFIRMATION_PREFIX = "ws:delivery:"
        
        # TTL for sessions (24 hours)
        self.SESSION_TTL = 86400
        # TTL for delivery confirmations (5 minutes)
        self.DELIVERY_TTL = 300

        # Async Redis client for blocking operations
        self._async_client: Optional[Any] = None

        # Pub/Sub
        self._pubsub = None
        self._pubsub_client: Optional[Redis] = None

    @property
    def async_client(self):
        """Get or create async Redis client for blocking operations."""
        if self._async_client is None:
            import redis.asyncio as aioredis
            self._async_client = aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=30
            )
        return self._async_client
    
    @property
    def client(self) -> Redis:
        """Get or create Redis client."""
        if self._client is None:
            try:
                self._client = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                # Test connection
                self._client.ping()
                logger.info("Redis connection established", extra={"url": self.redis_url})
            except Exception as e:
                logger.error("Failed to connect to Redis", extra={"error": str(e)}, exc_info=True)
                raise
        return self._client
    
    def store_session(
        self, 
        session_id: str, 
        user_id: str, 
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Store a WebSocket session in Redis.
        
        Args:
            session_id: Unique session identifier
            user_id: User ID associated with the session
            metadata: Additional metadata to store
            
        Returns:
            True if successful, False otherwise
        """
        try:
            session_data = {
                "user_id": user_id,
                "session_id": session_id,
                "connected_at": datetime.now(timezone.utc).isoformat(),
                **(metadata or {})
            }
            
            session_key = f"{self.SESSION_PREFIX}{session_id}"
            user_sessions_key = f"{self.USER_SESSIONS_PREFIX}{user_id}"
            
            # Store session data
            self.client.setex(
                session_key,
                self.SESSION_TTL,
                json.dumps(session_data)
            )
            
            # Add session to user's session set
            self.client.sadd(user_sessions_key, session_id)
            self.client.expire(user_sessions_key, self.SESSION_TTL)
            
            logger.debug("Session stored in Redis", extra={
                "session_id": session_id,
                "user_id": user_id
            })
            return True
            
        except Exception as e:
            logger.error("Failed to store session in Redis", extra={
                "session_id": session_id,
                "error": str(e)
            }, exc_info=True)
            return False
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session data from Redis.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session data dictionary or None if not found
        """
        try:
            session_key = f"{self.SESSION_PREFIX}{session_id}"
            data = self.client.get(session_key)
            
            if data:
                return json.loads(data)
            return None
            
        except Exception as e:
            logger.error("Failed to get session from Redis", extra={
                "session_id": session_id,
                "error": str(e)
            })
            return None
    
    def remove_session(self, session_id: str) -> bool:
        """Remove a session from Redis.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get session data to find user_id
            session = self.get_session(session_id)
            if not session:
                return False
            
            user_id = session.get("user_id")
            
            # Remove session data
            session_key = f"{self.SESSION_PREFIX}{session_id}"
            self.client.delete(session_key)
            
            # Remove from user's session set
            if user_id:
                user_sessions_key = f"{self.USER_SESSIONS_PREFIX}{user_id}"
                self.client.srem(user_sessions_key, session_id)
            
            # Remove pending executions
            pending_key = f"{self.PENDING_PREFIX}{session_id}"
            self.client.delete(pending_key)
            
            logger.debug("Session removed from Redis", extra={
                "session_id": session_id,
                "user_id": user_id
            })
            return True
            
        except Exception as e:
            logger.error("Failed to remove session from Redis", extra={
                "session_id": session_id,
                "error": str(e)
            }, exc_info=True)
            return False
    
    def get_user_sessions(self, user_id: str) -> Set[str]:
        """Get all active session IDs for a user.
        
        Args:
            user_id: User identifier
            
        Returns:
            Set of session IDs
        """
        try:
            user_sessions_key = f"{self.USER_SESSIONS_PREFIX}{user_id}"
            sessions = self.client.smembers(user_sessions_key)
            return sessions if sessions else set()
            
        except Exception as e:
            logger.error("Failed to get user sessions from Redis", extra={
                "user_id": user_id,
                "error": str(e)
            })
            return set()
    
    def add_pending_execution(self, session_id: str, execution_id: str) -> bool:
        """Add a pending execution to a session.
        
        Args:
            session_id: Session identifier
            execution_id: Execution identifier
            
        Returns:
            True if successful, False otherwise
        """
        try:
            pending_key = f"{self.PENDING_PREFIX}{session_id}"
            self.client.sadd(pending_key, execution_id)
            self.client.expire(pending_key, self.SESSION_TTL)
            return True
            
        except Exception as e:
            logger.error("Failed to add pending execution", extra={
                "session_id": session_id,
                "execution_id": execution_id,
                "error": str(e)
            })
            return False
    
    def remove_pending_execution(self, session_id: str, execution_id: str) -> bool:
        """Remove a pending execution from a session.
        
        Args:
            session_id: Session identifier
            execution_id: Execution identifier
            
        Returns:
            True if successful, False otherwise
        """
        try:
            pending_key = f"{self.PENDING_PREFIX}{session_id}"
            self.client.srem(pending_key, execution_id)
            return True
            
        except Exception as e:
            logger.error("Failed to remove pending execution", extra={
                "session_id": session_id,
                "execution_id": execution_id,
                "error": str(e)
            })
            return False
    
    def get_pending_executions(self, session_id: str) -> Set[str]:
        """Get all pending executions for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Set of execution IDs
        """
        try:
            pending_key = f"{self.PENDING_PREFIX}{session_id}"
            pending = self.client.smembers(pending_key)
            return pending if pending else set()
            
        except Exception as e:
            logger.error("Failed to get pending executions", extra={
                "session_id": session_id,
                "error": str(e)
            })
            return set()
    
    def update_session_ttl(self, session_id: str) -> bool:
        """Refresh the TTL for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            True if successful, False otherwise
        """
        try:
            session_key = f"{self.SESSION_PREFIX}{session_id}"
            self.client.expire(session_key, self.SESSION_TTL)
            
            pending_key = f"{self.PENDING_PREFIX}{session_id}"
            self.client.expire(pending_key, self.SESSION_TTL)
            
            return True
            
        except Exception as e:
            logger.error("Failed to update session TTL", extra={
                "session_id": session_id,
                "error": str(e)
            })
            return False

    def _delivery_channel_key(self, execution_id: str) -> str:
        """Build the Redis key for a delivery confirmation channel.

        Args:
            execution_id: The execution ID.

        Returns:
            Redis key string.
        """
        return f"{self.DELIVERY_CONFIRMATION_PREFIX}{execution_id}"

    def confirm_delivery_push(self, execution_id: str, session_id: str) -> bool:
        """Push a delivery confirmation via Redis pub/sub channel.

        Args:
            execution_id: The execution ID that was delivered.
            session_id: The session ID that received the message.

        Returns:
            True if published successfully, False otherwise.
        """
        try:
            channel = self._delivery_channel_key(execution_id)
            payload = json.dumps({
                "execution_id": execution_id,
                "session_id": session_id,
                "delivered_at": datetime.now(timezone.utc).isoformat()
            })
            self.client.publish(channel, payload)
            logger.debug("Delivery push published", extra={
                "execution_id": execution_id,
                "session_id": session_id
            })
            return True
        except Exception as e:
            logger.error("Failed to publish delivery push", extra={
                "execution_id": execution_id,
                "session_id": session_id,
                "error": str(e)
            })
            return False

    def confirm_delivery(self, execution_id: str, session_id: str) -> bool:
        """Confirm that a message was delivered to a WebSocket client.

        Writes confirmation via two mechanisms:
          1. SETEX on the hash key  – used by the polling wait_for_delivery()
          2. RPUSH on the list key   – used by wait_for_delivery_async() (BLPOP)

        Args:
            execution_id: The execution ID that was delivered
            session_id: The session ID that received the message

        Returns:
            True if confirmation was stored, False otherwise
        """
        try:
            confirmation_key = f"{self.DELIVERY_CONFIRMATION_PREFIX}{execution_id}"
            confirmation_data = json.dumps({
                "execution_id": execution_id,
                "session_id": session_id,
                "delivered_at": datetime.now(timezone.utc).isoformat()
            })

            # Store confirmation as a simple value with TTL (for polling)
            self.client.setex(confirmation_key, self.DELIVERY_TTL, confirmation_data)

            # Also push to LIST so blocking BLPOP waiter gets the signal
            self.client.rpush(confirmation_key, confirmation_data)

            logger.debug("Delivery confirmed", extra={
                "execution_id": execution_id,
                "session_id": session_id
            })
            return True
        except Exception as e:
            logger.error("Failed to confirm delivery", extra={
                "execution_id": execution_id,
                "session_id": session_id,
                "error": str(e)
            })
            return False
    
    async def wait_for_delivery(
        self, 
        execution_id: str, 
        timeout: float = 10.0,
        poll_interval: float = 0.1
    ) -> Optional[Dict[str, Any]]:
        """Wait for delivery confirmation of an execution.
        
        Args:
            execution_id: The execution ID to wait for
            timeout: Maximum time to wait in seconds
            poll_interval: Time between checks in seconds
            
        Returns:
            Confirmation data if delivered, None if timeout
        """
        confirmation_key = f"{self.DELIVERY_CONFIRMATION_PREFIX}{execution_id}"
        elapsed = 0.0
        
        while elapsed < timeout:
            try:
                data = self.client.get(confirmation_key)
                if data:
                    # Clean up the confirmation key
                    self.client.delete(confirmation_key)
                    return json.loads(data)
            except Exception as e:
                logger.error("Error checking delivery confirmation", extra={
                    "execution_id": execution_id,
                    "error": str(e)
                })
            
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
        
        logger.warning("Delivery confirmation timeout", extra={
            "execution_id": execution_id,
            "timeout": timeout
        })
        return None

    async def wait_for_delivery_async(
        self,
        execution_id: str,
        timeout: float = 10.0
    ) -> Optional[Dict[str, Any]]:
        """Wait for delivery confirmation using async BLPOP (non-polling).

        Uses Redis BLPOP for efficient blocking instead of polling.

        Args:
            execution_id: The execution ID to wait for.
            timeout: Maximum time to wait in seconds.

        Returns:
            Confirmation data dict if delivered, None if timeout.
        """
        try:
            # Create a temporary list key that BLPOP can wait on
            list_key = f"{self.DELIVERY_CONFIRMATION_PREFIX}{execution_id}"
            # Push a sentinel value that we will clean up
            # We use LPUSH then BLPOP to wait for the value
            client = self.async_client

            # Push sentinel then immediately BLPOP - the sentinel will be
            # consumed and we wait for the actual confirmation
            import uuid
            sentinel_id = str(uuid.uuid4())
            await client.lpush(list_key, f"__sentinel:{sentinel_id}")

            # Wait for the actual delivery confirmation via BLPOP
            result = await client.blpop(list_key, timeout=int(timeout))

            if result is None:
                # Timeout waiting for confirmation
                # Clean up any leftover sentinel
                await client.lrem(list_key, 0, f"__sentinel:{sentinel_id}")
                logger.warning("Delivery confirmation timeout", extra={
                    "execution_id": execution_id,
                    "timeout": timeout
                })
                return None

            _, value = result

            # Skip sentinel values - they indicate timeout, not delivery
            if value and not value.startswith("__sentinel:"):
                # Clean up the confirmation key
                await client.delete(list_key)
                return json.loads(value)

            return None

        except Exception as e:
            logger.error("Error in async delivery wait", extra={
                "execution_id": execution_id,
                "error": str(e)
            }, exc_info=True)
            return None

    def has_active_sessions_for_user(self, user_id: str) -> bool:
        """Check if a user has any active WebSocket sessions.
        
        Args:
            user_id: User identifier
            
        Returns:
            True if user has active sessions, False otherwise
        """
        try:
            sessions = self.get_user_sessions(user_id)
            return len(sessions) > 0
        except Exception as e:
            logger.error("Failed to check user sessions", extra={
                "user_id": user_id,
                "error": str(e)
            })
            return False
    
    def close(self):
        """Close Redis connection."""
        if self._pubsub:
            self._pubsub.close()
            self._pubsub = None
        if self._pubsub_client:
            self._pubsub_client.close()
            self._pubsub_client = None
        if self._client:
            self._client.close()
            self._client = None
    
    def publish_execution_event(self, event_data: Dict[str, Any]) -> bool:
        """Publish an execution event to all workers via Redis pub/sub.
        
        Args:
            event_data: Event data to broadcast
            
        Returns:
            True if successful, False otherwise
        """
        try:
            message = json.dumps(event_data)
            self.client.publish(self.PUBSUB_CHANNEL, message)
            logger.debug("Published execution event to Redis", extra={
                "execution_id": event_data.get("execution_id"),
                "type": event_data.get("type")
            })
            return True
        except Exception as e:
            logger.error("Failed to publish execution event", extra={
                "error": str(e)
            }, exc_info=True)
            return False
    
    async def subscribe_to_execution_events(self, callback: Callable[[Dict[str, Any]], None]):
        """Subscribe to execution events from Redis pub/sub.
        
        This should be run in a background task. It will call the callback
        for each message received on the pub/sub channel.
        
        Args:
            callback: Async function to call with each event
        """
        try:
            # Create separate Redis client for pub/sub (can't use the same one)
            if self._pubsub_client is None:
                self._pubsub_client = redis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
            
            self._pubsub = self._pubsub_client.pubsub()
            await asyncio.get_event_loop().run_in_executor(
                None, 
                self._pubsub.subscribe, 
                self.PUBSUB_CHANNEL
            )
            
            logger.info("Subscribed to execution events", extra={
                "channel": self.PUBSUB_CHANNEL
            })
            
            # Listen for messages
            while True:
                message = await asyncio.get_event_loop().run_in_executor(
                    None,
                    self._pubsub.get_message,
                    True,  # ignore_subscribe_messages
                    1.0    # timeout
                )
                
                if message and message['type'] == 'message':
                    try:
                        event_data = json.loads(message['data'])
                        await callback(event_data)
                    except Exception as e:
                        logger.error("Error processing pub/sub message", extra={
                            "error": str(e)
                        }, exc_info=True)
                
                # Small sleep to prevent tight loop
                await asyncio.sleep(0.01)
                
        except Exception as e:
            logger.error("Pub/sub subscription error", extra={
                "error": str(e)
            }, exc_info=True)


# Global instance
_redis_manager: Optional[RedisSessionManager] = None


def get_redis_manager() -> RedisSessionManager:
    """Get or create the global Redis session manager."""
    global _redis_manager
    if _redis_manager is None:
        _redis_manager = RedisSessionManager()
    return _redis_manager
