# routes Overview

Owns HTTP route handlers grouped by capability.

Routes should stay transport-thin: parse/normalize requests, invoke feature/application code, and serialize responses without reimplementing domain behavior.
