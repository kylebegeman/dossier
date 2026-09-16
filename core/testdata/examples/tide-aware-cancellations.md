# Tide-aware cancellations

*Tidewright · Wenlow Islands ferries*

The change cancels a Brisk sailing on its own when low water leaves too little depth at the ramp for the Gannet. Six findings, one of them a blocker. Approve or rework, then rule on each by number.

**1** blocker · **2** major · **2** minor · **1** nit · **4** checked · **Open** choice · **0** decided

2026-09-14 · in-review

## Scope

Joss's change adds a job that reads the tide table every hour and cancels any Brisk sailing where the depth at the ramp falls below the Gannet's draft plus a safety margin. Reviewed at revision `4e1c9a2`, with the tests run locally.

The tide table importer was reviewed on its own last month and is not covered here.

**What changed**

| File | Lines | What it does |
| --- | --- | --- |
| `booking/tide/window.go` | +184 | Finds when each sailing is at the ramp and the depth at that time. |
| `booking/cancel/auto.go` | +96 | Cancels a sailing that fails the check and records why. |
| `booking/cancel/auto_test.go` | +212 | Covers a spring tide, a neap tide, and a missing table. |
| `config/vessels.yaml` | +6 | Adds the Gannet's draft and the safety margin. |

## Findings

| # | Finding | Severity | Effort |
| --- | --- | --- | --- |
| 1 | Tide times compared in UTC against local sailing times | blocker | S |
| 2 | Riders get no notice when the job cancels a sailing | major | M |
| 3 | The Gannet's draft is read once at startup | major | S |
| 4 | No backoff when the tide table is missing | minor | S |
| 5 | The 0.4 metre margin has no source | minor | S |
| 6 | Test names describe the code, not the tide | nit | S |

*Effort is agent time, not calendar time: S is under an hour, M is a few hours with review, L is a day or more across sessions.*

### 1. Tide times compared in UTC against local sailing times

blocker · correctness · Effort S

Sailing times are local and tide times are UTC, so in summer time every check looks at the wrong hour.

#### Where

`booking/tide/window.go`, line 58, in `depthAt`.

#### Why it matters

From March to October the job reads the depth an hour away from departure. A sailing at low water can pass the check, and the Gannet can ground at the ramp.

#### Fix

Convert the departure to the harbour's time zone before the lookup, and keep tide times with their zone.

#### Evidence

The spring tide test passes only because its fixture is in January. Moved to 14 July, the 06:05 sailing reads 2.9 m where the table gives 1.7 m.

#### Diff

```diff
-	at := sailing.Departs
+	at := sailing.Departs.In(harbour.Zone)
 	depth := table.DepthAt(at.UTC())
```

### 2. Riders get no notice when the job cancels a sailing

major · riders · Effort M

The job sets the sailing's status directly and skips the notice path, so riders learn at the harbour.

#### Where

`booking/cancel/auto.go`, in `Cancel`, which writes the status instead of calling `cancel.Sailing`.

#### Why it matters

A cancellation at 05:00 for the 07:40 reaches nobody. Riders drive to Varre and find the ramp closed.

#### Fix

Call `cancel.Sailing` with the reason `tide`, which sends the plain notice with its free rebooking link.

### 3. The Gannet's draft is read once at startup

major · operations · Effort S

Changing the draft or the margin needs a deploy, and the harbour master changes the margin with the season.

#### Where

`config/vessels.yaml`, loaded in `booking/cmd/serve/main.go`, line 41.

#### Why it matters

The harbour master raises the margin in winter swell. Today that takes a release, on the very day it matters most.

#### Fix

Read vessel limits from the settings table the office already edits, and log each change with who made it.

### 4. No backoff when the tide table is missing

minor · reliability · Effort S

When next month's table has not arrived, the job retries every second and floods the logs.

#### Where

`booking/cancel/auto.go`, line 112, the retry loop in `Run`.

#### Why it matters

The table arrives by email once a month and was late twice last year. The job would log 86,400 errors a day and quietly check nothing.

#### Fix

Back off to hourly, alert the office once, and show a banner that tide checks are off.

### 5. The 0.4 metre margin has no source

minor · maintainability · Effort S

The safety margin is a bare number, and nothing says where it came from or when it should change.

#### Where

`config/vessels.yaml`, line 9.

#### Why it matters

The next person to touch it will guess. The harbour master's letter from May sets 0.4 m in summer and 0.6 m from November.

#### Fix

Name it `ramp_margin_m`, set both seasons, and link the letter in a comment.

### 6. Test names describe the code, not the tide

nit · tests · Effort S

Names like TestRun2 hide which tide each test covers.

#### Where

`booking/cancel/auto_test.go`, all four tests.

#### Why it matters

When a test fails next year, its name should say which tide broke. Renaming costs a minute now.

#### Fix

Rename them after the tide they cover, such as `TestSpringLowWaterCancels` and `TestNeapTideSails`.

## Checked

- **Who can undo a tide cancellation**\
  Only the harbour office role can reinstate a sailing, and a test covers it.
- **Database migration**\
  The new reason column is nullable and backfills nothing, so it deploys without downtime.
- **Metrics and logs**\
  Each run logs the sailings checked and cancelled, and a counter feeds the existing dashboard.
- **Holm and Keddle sailings**\
  Left alone, as intended: both ramps have enough depth at every tide.

## How to rule

Choose approve or rework, then rule on findings by number. Numbers without a word mean fix.

**Approve or rework?**

- `approve` **Approve**: Merge once the findings marked fix are in.
- `rework` **Rework**: Send it back before it can merge.

For example: `rework, fix 1, 2; later 4; skip 6. Notes: 4: after the release.`

No decisions yet.
