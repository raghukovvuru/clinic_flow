# Bench Verification Checklist

Use this checklist whenever bench appears to be serving stale code.

## Core Rule

Frappe bench serves the code that exists on disk in:

- `/home/raghu/frappe-bench/apps/clinic_flow`

It does **not** serve:

- the “latest commit” in the abstract
- changes that exist only in another worktree
- changes that were made on another branch but not brought back into `apps/clinic_flow`

---

## 1. Confirm the Served Checkout

Run:

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
pwd
git status --short --branch
```

If your code changes are not present in this path, bench will not serve them.

---

## 2. If You Worked in a Worktree, Bring Changes Back First

If implementation happened in `.worktrees/...`, merge or cherry-pick it back into:

- `/home/raghu/frappe-bench/apps/clinic_flow`

Only then should you verify in the running bench.

---

## 3. For Backend / Python Changes

Safest verification sequence:

```bash
cd /home/raghu/frappe-bench
bench --site site1.localhost migrate
bench start
```

Why:

- `migrate` picks up hook/schema/patch-related changes
- restarting `bench start` clears stale imported Python modules in web, queue, and scheduler processes

---

## 4. For Frontend Desk / JS Changes

Run:

```bash
cd /home/raghu/frappe-bench
bench build
bench start
```

Then do a hard browser refresh.

Why:

- desk assets can remain stale until rebuilt
- browser cache can mask fresh changes

---

## 5. Hard Refresh the Browser

Always do a full refresh after desk-page changes.

A normal refresh is often not enough when:

- page JS changed
- CSS changed
- built desk assets changed

---

## 6. Use the Correct Verification URL

Check the active surfaces first:

- `http://site1.localhost:8000/receptionist-dashboard`
- `http://site1.localhost:8000/clinic/arrival-counter`
- `http://site1.localhost:8000/doctor-workspace-v2`

Do not rely on legacy page behavior unless your change touched legacy paths.

---

## 7. If It Still Looks Stale

Ask these questions in order:

1. Did I edit `/home/raghu/frappe-bench/apps/clinic_flow` or only a worktree?
2. Did I merge or cherry-pick the worktree changes back?
3. Did I run `bench build` for JS/desk changes?
4. Did I run `bench --site site1.localhost migrate` for hook/doctype/patch changes?
5. Did I restart `bench start`?
6. Did I hard refresh the browser?

---

## Recommended Short Workflow

### Backend change

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git status --short --branch
cd /home/raghu/frappe-bench
bench --site site1.localhost migrate
bench start
```

### Frontend desk change

```bash
cd /home/raghu/frappe-bench/apps/clinic_flow
git status --short --branch
cd /home/raghu/frappe-bench
bench build
bench start
```

Then hard refresh the browser.

---

## Main Takeaway

If bench looks stale, the first thing to verify is not the commit hash.

The first thing to verify is:

- **what exact files exist in `/home/raghu/frappe-bench/apps/clinic_flow` right now**

That is the checkout bench is actually serving.
