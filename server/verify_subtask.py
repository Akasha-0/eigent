import ast
import sys

with open("app/core/redis_utils.py", "r") as f:
    src = f.read()

tree = ast.parse(src)
async_funcs = [n.name for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef)]

print("Async function definitions found:")
for name in async_funcs:
    print(" -", name)

if "wait_for_delivery" in async_funcs:
    print("FAIL: wait_for_delivery still exists")
    sys.exit(1)
else:
    print("PASS: wait_for_delivery not found (removed successfully)")

if "wait_for_delivery_async" in async_funcs:
    print("PASS: wait_for_delivery_async exists")
else:
    print("FAIL: wait_for_delivery_async not found")
    sys.exit(1)
