# Release 3.4.0

*Tidewright · Wenlow Islands ferries*

Offline boarding passes, tide-aware cancellations, and the capacity fix from the 07:40, ready for the winter timetable. One required gate failed and two gates are pending. Ship or hold, then waive or rerun what did not pass.

**2291** build · **5 October** target · **1** failed · **2** pending · **4** passed · **1** skipped · **Open** choice · **0** decided

2026-10-01 · for-decision

## What ships

3.4.0 carries what the winter timetable needs before it starts on 26 October. It reaches riders in stages: a tenth of app users on the first day, then everyone after three days without a rollback trigger.

**Changes**

| Change | What riders see | Rollout |
| --- | --- | --- |
| Offline boarding passes | Passes scan at the Brisk slipway with no signal. | Brisk only, behind a flag |
| Tide-aware cancellations | A Brisk sailing too shallow for the ramp cancels early, with a notice. | The office approves each one for a month |
| Capacity check on held places | Nothing, unless a deck is full, when a second sale is refused. | Everyone |
| Winter timetable | Fewer Gannet crossings and a later first boat to Keddle. | Everyone |

**Offline scan time on the oldest handheld, by build (ms)**

|  | Value |
| --- | --- |
| 2270 | 1450 |
| 2276 | 1120 |
| 2283 | 840 |
| 2288 | 610 |
| 2291 | 540 |

## Gates

| # | Gate | Status | Required |
| --- | --- | --- | --- |
| 1 | Android end-to-end suite | failed | Yes |
| 2 | App Store review | pending | Yes |
| 3 | Harbour office walkthrough of tide cancellations | pending |  |
| 4 | Unit and integration tests | passed | Yes |
| 5 | Load test at storm-day volume | passed | Yes |
| 6 | Accessibility pass on booking and passes | passed | Yes |
| 7 | Crash-free beta sessions above 99.5% | passed | Yes |
| 8 | Wallet pass validation | skipped |  |

### 1. Android end-to-end suite

failed · Required

212 of 214 scenarios passed, and both failures are offline scans on Android 10 handhelds.

#### How checked

CI job `e2e-android` on build 2291, across the four handheld models the crews carry.

#### Result

212 of 214 passed. On Android 10, a scan made within 30 seconds of losing signal waits 4 seconds for the network before it checks offline.

#### Evidence

Job 18834, scenarios `offline-scan-signal-drop` and `offline-scan-airplane-mode`, with screen recordings attached.

#### Risk

Two of the Gannet's six handhelds run Android 10. Some scans at the Brisk ramp would take four seconds, and a queue of cars would notice.

### 2. App Store review

pending · Required

Build 2291 went in for review on 29 September, and reviews have taken one to two days.

#### How checked

The build's status in App Store Connect.

#### Result

Waiting for review since 29 September at 16:20.

#### Note

Android does not wait on this, but staging one platform ahead of the other confuses the harbour office.

### 3. Harbour office walkthrough of tide cancellations

pending

The office has to agree to approve each automatic cancellation for the first month.

#### How checked

A walkthrough on the staging site with the harbour office, run by Ines.

#### Result

Booked for 2 October.

### 4. Unit and integration tests

passed · Required

1,904 tests passed on build 2291.

#### How checked

CI job `test` on build 2291.

#### Result

1,904 passed and none failed. Twelve are skipped because they cover the retired summer Petrel timetable.

### 5. Load test at storm-day volume

passed · Required

Six times normal traffic held booking at 420 ms p95, against an 800 ms target.

#### How checked

`k6 run load/storm-day.js` against staging for 30 minutes, at six times a normal winter Tuesday.

#### Result

420 ms at p95 and 910 ms at p99, with no errors. The target is 800 ms at p95.

### 6. Accessibility pass on booking and passes

passed · Required

Screen reader and keyboard checks passed on every changed screen, the new pass screen included.

#### How checked

VoiceOver and TalkBack walkthroughs by Mira, and `axe` in CI.

#### Result

Nothing blocking. The pass screen now reads out the sailing and party before the code.

### 7. Crash-free beta sessions above 99.5%

passed · Required

The beta ran 99.62% crash-free over seven days and 1,840 sessions.

#### How checked

Crash reports from the 3.4.0 beta group, 22 to 29 September.

#### Result

99.62% of 1,840 sessions were crash-free, above the 99.5% gate.

### 8. Wallet pass validation

skipped

Not run, because wallet passes are out of scope for 3.4.0.

#### How checked

Not run.

#### Result

Skipped by the offline boarding passes plan. Wallet passes wait for a later release.

## Rollback

Roll back when crash-free sessions fall below 99% for an hour, or when more than 2 in 100 scans at any harbour fall back to the paper list. Joss or Tomas can do it alone, day or night.

**Rollback steps**

```sh
# Stop the staged rollout where it is
release halt 3.4.0

# Turn offline passes off at Brisk; scanners go back to online checks
flags set offline-passes --harbour brisk --off

# Return the booking service to 3.3.2
deploy booking --version 3.3.2 --reason "rollback 3.4.0"
```

## How to decide

Choose ship or hold, then waive or rerun any gate that did not pass.

**Ship or hold?**

- `ship` **Ship**: Release now, with any waivers noted.
- `hold` **Hold**: Wait until the gates that did not pass are settled.

For example: `ship, waive 3. Notes: 3: known arm64 flake.`

No decisions yet.
