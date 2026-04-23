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

from app.shared.middleware.rate_limit import (
    auto_login_rate_limiter,
    dev_login_rate_limiter,
    login_rate_limiter,
    password_rate_limiter,
    rate_limiter_factory,
    register_rate_limiter,
    webhook_rate_limiter,
    install_rate_limiter,
)


def test_rate_limiter_factory_returns_depends():
    result = rate_limiter_factory(times=5, seconds=60)
    assert result is not None


def test_rate_limiter_factory_custom_times():
    limiter = rate_limiter_factory(times=3, seconds=120)
    assert limiter is not None


def test_rate_limiter_factory_zero_seconds():
    limiter = rate_limiter_factory(times=10, seconds=0)
    assert limiter is not None


def test_login_rate_limiter_exists():
    assert login_rate_limiter is not None


def test_register_rate_limiter_exists():
    assert register_rate_limiter is not None


def test_webhook_rate_limiter_exists():
    assert webhook_rate_limiter is not None


def test_install_rate_limiter_exists():
    assert install_rate_limiter is not None


def test_dev_login_rate_limiter_exists():
    assert dev_login_rate_limiter is not None


def test_auto_login_rate_limiter_exists():
    assert auto_login_rate_limiter is not None


def test_password_rate_limiter_exists():
    assert password_rate_limiter is not None


def test_all_rate_limiters_are_unique():
    limiters = [
        login_rate_limiter,
        register_rate_limiter,
        webhook_rate_limiter,
        install_rate_limiter,
        dev_login_rate_limiter,
        auto_login_rate_limiter,
        password_rate_limiter,
    ]
    assert len(limiters) == len(set(id(l) for l in limiters))
