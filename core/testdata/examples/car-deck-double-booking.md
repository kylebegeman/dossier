# Double-booked car deck on the 07:40

*Tidewright · Wenlow Islands ferries*

Eleven car spaces on the Gannet's 07:40 from Varre to Holm were sold twice. Every driver crossed that morning, eleven of them on a relief sailing. What happened, why, and six follow-ups to commit to by number.

**SEV-2** severity · **11** drivers moved · **1 h 30** longest wait · **2** detect · **2** mitigate · **2** prevent · **3** contributing factors · **0** decided

2026-09-15 · resolved

## Impact

On Wednesday 9 September, the Gannet's 07:40 to Holm had 53 cars booked for 42 spaces. Crew caught it at the ramp check at 06:12. Every driver crossed that morning: 42 on the 07:40, and the 11 who booked last on a relief sailing at 09:10.

Two drivers missed the start of their shifts on Holm, and the harbour office took 64 calls before 09:00.

**Cars booked on the 07:40 through the evening before, against 42 spaces**

|  | Value |
| --- | --- |
| 18:00 | 31 |
| 19:00 | 38 |
| 20:00 | 41 |
| 20:30 | 42 |
| 21:00 | 53 |
| 22:00 | 53 |

- **Drivers moved**: 11, to a relief sailing at 09:10, each with a full refund and a free return.
- **Longest wait**: 1 hour 30 minutes at the Varre ramp.
- **Office calls**: 64 before 09:00, against 9 on a normal Wednesday.
- **Bookings lost**: None. Every double sale traces to one office terminal.

## Timeline

- **Tue 20:04** The 07:40 sells its last car space\
  Online sales reach 42 of 42 cars, and the app shows the deck as full.
- **Tue 20:31** The harbour office terminal reconnects\
  After a restart for an update, the terminal replays eleven car holds it had kept offline since the afternoon. The booking service accepts all eleven.
- **Wed 06:12** Crew count 53 cars booked for 42 spaces\
  The ramp check at Varre compares the loading list with the deck plan, and it does not add up.
- **Wed 06:20** Incident declared at SEV-2\
  Joss is paged and joins from home. Ines takes the office phones.
- **Wed 06:48** A relief sailing is agreed for 09:10\
  The Gannet's master agrees a second crossing, and the office texts the eleven drivers who booked last.
- **Wed 07:40** The Gannet sails full
- **Wed 08:17** Every moved driver refunded\
  Eleven refunds and free returns go out, and offline holds are switched off on the terminal.
- **Wed 09:10** The relief sailing leaves with all eleven cars

## Contributing factors

- **Offline holds were replayed without a capacity check**\
  The terminal's replay path writes holds straight to the bookings table, past the check every other sale goes through.

  *Evidence:* The booking log has eleven `hold.replay` events between 20:31:07 and 20:31:09, and none of them has a `capacity.check` span.
- **Nothing alerts when a sailing sells past capacity**\
  The oversale was in the data from 20:31, and nobody saw it for ten hours.

  *Evidence:* The capacity dashboard showed 53 of 42 all night. Its alerts only cover payment failures.
- **Offline holds never expire**\
  The terminal had held those eleven places since 14:05, and would have replayed them days later.

## Follow-ups

| # | Follow-up | Category | Owner | Effort | Impact |
| --- | --- | --- | --- | --- | --- |
| 1 | Alert when any sailing sells past capacity | detect | Joss | S | 5/5 |
| 2 | Show cars sold against spaces on the loading list | detect | Mira | S | 3/5 |
| 3 | A runbook for an overbooked sailing | mitigate | Ines | S | 3/5 |
| 4 | Tell the last drivers before they set off | mitigate | Tomas | M | 4/5 |
| 5 | Check capacity when the terminal replays holds | prevent | Tomas | M | 5/5 |
| 6 | Expire offline holds after ten minutes | prevent | Mira | S | 4/5 |

*Effort is agent time, not calendar time: S is under an hour, M is a few hours with review, L is a day or more across sessions.*

### 1. Alert when any sailing sells past capacity

detect · open · Effort S · Owner Joss · Impact 5/5

A check every minute pages whoever is on call when bookings exceed spaces on any sailing.

#### Addresses

Nothing alerts when a sailing sells past capacity, and ten hours passed between the double sale and the ramp check.

#### What changes

A query compares bookings with deck spaces for every sailing in the next 72 hours, once a minute, and pages on any excess.

#### Done when

Replaying the 9 September data in staging pages within two minutes.

### 2. Show cars sold against spaces on the loading list

detect · done · Effort S · Owner Mira · Impact 3/5

The crew's loading list opens with cars sold against spaces, in ochre when they do not fit.

#### Addresses

Crew found the problem at 06:12 by counting the list against the deck plan.

#### What changes

The list header shows the count, such as 53 of 42, and marks each car sold after the deck was full.

#### Note

Shipped on 11 September in crew app 2.8.1.

### 3. A runbook for an overbooked sailing

mitigate · open · Effort S · Owner Ines · Impact 3/5

One page on who to call, how to arrange a relief sailing, and what to offer the drivers moved.

#### Addresses

The 28 minutes from 06:20 to 06:48, spent finding out who could approve a relief sailing.

#### What changes

A page in the office handbook with the masters' numbers, the relief sailing checklist, and the standard offer of a refund and a free return.

### 4. Tell the last drivers before they set off

mitigate · open · Effort M · Owner Tomas · Impact 4/5

When a sailing is oversold, the drivers who booked last get a message and a held place on the next sailing.

#### Addresses

Eleven drivers learned at the ramp, some after a long drive to Varre.

#### What changes

The oversale alert messages each driver past capacity, in booking order, with a held place on the next sailing and a free cancellation.

#### Done when

In staging, an oversold sailing sends every message within five minutes of the alert.

### 5. Check capacity when the terminal replays holds

prevent · open · Effort M · Owner Tomas · Impact 5/5

Replayed holds go through the same capacity check as every other sale, and fail in plain sight when a deck is full.

#### Addresses

Offline holds were replayed without a capacity check.

#### What changes

The replay path calls `booking.Hold` instead of inserting rows, and the terminal lists each refused hold with the next sailing that has room.

#### Done when

A replay test against a full sailing refuses every hold, and the terminal lists them all.

### 6. Expire offline holds after ten minutes

prevent · open · Effort S · Owner Mira · Impact 4/5

A hold made offline lapses after ten minutes, the same as a hold made in the app.

#### Addresses

Offline holds never expire, and these were six hours old when they replayed.

#### What changes

The terminal stamps each offline hold with its time, drops it after ten minutes, and tells the clerk which holds lapsed.

#### Note

The office asked for twenty minutes on busy mornings. Ten matches the app, and a clerk can always hold again.

## How to commit

Commit to follow-ups by number. Numbers without a word mean do.

For example: `do 1, 2, 4; later 3. Notes: 3: after the winter timetable.`

No decisions yet.
