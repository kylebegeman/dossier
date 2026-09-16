# Ten moves for a calmer winter crossing

*Tidewright · Wenlow Islands ferries*

Six small moves and four large ones for the ferry ticketing app, and one choice first: build for storm days or for quiet midweeks. Pick by number.

**6** minor · **4** major · **3** also considered · **Open** choice · **0** picked

2026-09-16 · for-decision

## Winter is the hard season

Tidewright runs ticketing for the Wenlow Islands ferries: three routes from Varre, two boats, and about 2,400 bookings a week in winter. Four of us build it, with agents doing most of the writing.

Winter is where the product hurts. A storm cancels sailings with a few hours of notice, every rider on them needs a new crossing at once, and the harbour office takes the load by phone. On quiet midweeks the boats run half empty.

These ten moves aim at both problems. Effort is agent time, not calendar time.

![A map of the three routes from Varre to Keddle, Holm, and Brisk.](assets/wenlow-routes.svg)

*Three routes from Varre. The Brisk crossing is the longest and the first to cancel in a gale.*

## Where winter hurts

Contacts to the harbour office rose sixfold from October to January last winter, and most of them were riders trying to rebook.

**Harbour office contacts per month, winter 2025 to 2026**

|  | Value |
| --- | --- |
| Oct | 410 |
| Nov | 1240 |
| Dec | 2050 |
| Jan | 2480 |
| Feb | 1960 |
| Mar | 820 |

- **38 sailings**: Cancelled for weather between November and March.
- **61%**: Of winter contacts were riders rebooking a cancelled crossing.
- **11 minutes**: Average office time per refund, the second largest contact type.
- **4 people**: Build and run the product, and nobody is on call overnight.

> **Storm days carry the load**
>
> On the eleven worst days, contacts ran at six times a normal day. Anything that spreads rebooking across hours, or starts it a day early, helps more than anything that makes the office faster.

## Ideas

| # | Idea | Size | Effort | Impact | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Rebook in one tap on storm days | minor | M | 5/5 |  |
| 2 | Plain cancellation notices | minor | S | 4/5 |  |
| 3 | A waitlist for full car decks | minor | M | 4/5 | 1 |
| 4 | The midweek fare beside weekend searches | minor | S | 3/5 |  |
| 5 | A weather line on every ticket | minor | S | 3/5 |  |
| 6 | Delay reasons from the deck | minor | S | 4/5 |  |
| 7 | Warn riders two days before a storm | major | L | 5/5 | 5, 1 |
| 8 | A flexible winter pass | major | M | 4/5 | 4 |
| 9 | Priority rebooking for island residents | major | M | 4/5 | 3 |
| 10 | Refunds without calling | major | L | 5/5 | 2 |

*Effort is agent time, not calendar time: S is under an hour, M is a few hours with review, L is a day or more across sessions.*

### 1. Rebook in one tap on storm days

minor · Effort M · Impact 5/5

When a sailing is cancelled, every rider gets a link that moves them to the next crossing with room.

#### How it works

Cancelling a sailing sends each rider a link with the next three crossings that have room, each held for 20 minutes. One tap moves the booking and voids the old ticket.

#### Why

Rebooking was 61% of winter contacts. Riders want the next boat, not a phone queue, and a held place removes the scramble.

#### In use

A rider booked on the 16:10 to Keddle gets a message at 13:02 and is on the 18:40 before the harbour office opens its phones.

#### Unlocks

The held place is the same mechanism 3 and 7 need.

#### Risk

Holds can strand walk-up riders on a busy boat. Cap holds at half the free space on any sailing.

### 2. Plain cancellation notices

minor · Effort S · Impact 4/5

Notices say what happened, what happens next, and that changing a ticket costs nothing.

#### How it works

Three templates replace the free-text notices: cancelled, delayed, and at risk. Each names the sailing, the reason, the next step, and the cost, which is nothing.

#### Why

Riders call to ask whether rebooking costs money. A notice that says so answers the most common question before anyone dials.

#### In use

The notice reads: the 16:10 to Keddle is cancelled for wind. Tap to move to the 18:40, free.

### 3. A waitlist for full car decks

minor · Effort M · Impact 4/5 · Depends on 1

Riders join a waitlist when a car deck is full, and released spaces are offered in order.

#### How it works

A full car deck offers a waitlist instead of an error. When a space frees up, the next rider gets it held for 15 minutes, then the next rider does.

#### Why

Car space is the scarce thing in winter, when the Gannet runs fewer crossings. Today riders refresh the page and phone the office.

#### Risk

A waitlist can promise too much. Show each rider their place and how often spaces free up on that sailing.

### 4. The midweek fare beside weekend searches

minor · Effort S · Impact 3/5

A search for a weekend crossing shows the cheaper Tuesday to Thursday fare on the same route.

#### How it works

A search for Friday to Sunday adds one line with the lowest fare on the same route from Tuesday to Thursday that week, with a one-tap switch.

#### Why

Midweek boats run half empty in winter while weekends sell out. A nudge moves flexible riders without changing a single price.

### 5. A weather line on every ticket

minor · Effort S · Impact 3/5

Tickets and reminders show the forecast risk for that sailing, refreshed every three hours.

#### How it works

Each ticket shows calm, watch, or at risk from the marine forecast for the crossing, refreshed every three hours and repeated in the day-before reminder.

#### Why

Riders who know a crossing is at risk move early, which spreads rebooking across hours instead of one spike.

#### Unlocks

The forecast feed is the input 7 scores.

### 6. Delay reasons from the deck

minor · Effort S · Impact 4/5

Crew post a delay reason in one tap, and the departures board and every ticket update.

#### How it works

The crew app gets four buttons: waiting for cars, weather, mechanical, and harbour traffic. A tap updates the departures board and every ticket on that sailing.

#### Why

An unexplained delay starts phone calls. The crew know the reason first and have no way to say it.

### 7. Warn riders two days before a storm

major · Effort L · Impact 5/5 · Depends on 5, 1

A forecast score flags sailings 48 hours out and offers free moves before any cancellation.

#### How it works

A daily job scores every sailing in the next 48 hours against the operator's wind and swell limits. Sailings over the line offer a free move before anything is cancelled.

#### Why

Moving riders a day early turns the storm-day spike into a calm trickle, and riders keep their plans.

#### In use

On Tuesday evening, riders booked on Thursday's early crossings see: storm likely, move to Wednesday for free.

#### Risk

False alarms teach riders to ignore warnings. Start with the operator confirming each warning before it sends.

### 8. A flexible winter pass

major · Effort M · Impact 4/5 · Depends on 4

Ten crossings on any sailing from November to March, moved or cancelled for free.

#### How it works

A pass holds ten crossings. Riders book as they would any ticket, and moving or cancelling returns the crossing to the pass.

#### Why

Island residents cross every week in winter and pay for every storm in lost time. A pass rewards them for booking at all.

#### Risk

Passes can crowd popular sailings. Limit pass bookings to 30% of each car deck.

### 9. Priority rebooking for island residents

major · Effort M · Impact 4/5 · Depends on 3

Verified residents rebook first on storm days and keep a reserved share of each car deck.

#### How it works

Residents verify once with a council address. On storm days they rebook an hour before everyone else, and 15% of each car deck stays theirs until 24 hours out.

#### Why

Residents need the boat for work, school, and supplies. Most visitors can wait a day.

#### Risk

Verification touches personal data. Keep only a yes, a no, and an expiry date, never the address.

### 10. Refunds without calling

major · Effort L · Impact 5/5 · Depends on 2

Riders refund cancelled or unwanted crossings themselves, within the fare policy, in seconds.

#### How it works

A refund button applies the fare policy: a full refund for cancellations, a small fee for a change of plans inside 24 hours. The payment provider returns the money to the card.

#### Why

Refunds are the second largest contact type and take the office eleven minutes each. Most follow rules a page can apply.

#### Note

Card refunds take the provider three to five working days to show, whatever we build. The confirmation should say so.

## Also considered

- **Book a seat in the heated shelter**\
  Not ticketing: the harbour authority runs the shelters and has its own plans.
- **A surcharge on storm-risk sailings**\
  It charges riders for weather they cannot control and would push residents away.
- **A chat assistant for rebooking**\
  One tap does the job better than a conversation, once idea 1 ships.

## How to pick

Reply with the numbers you want, plus notes on anything to change.

**What should winter build for first?**

- `storms` **Storm days**: Rebooking, warnings, and refunds for the eleven worst days of the season.
- `midweeks` **Quiet midweeks**: Fares and passes that fill the emptier Tuesday to Thursday boats.

For example: `storms, 2, 5, 7. Notes: 5: smaller first.`

No decisions yet.
