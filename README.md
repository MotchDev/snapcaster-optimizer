# Snapcaster Cart Optimizer

A small browser script for finding good multi-store MTG orders using [Snapcaster.ca](https://snapcaster.ca).

> [!NOTE]
> This is an unofficial hobby project. It is not affiliated with Snapcaster or any of the stores it searches.

## What it does

Given a Snapcaster search, the optimizer:

- Reads all cards, stores, prices, printings and conditions from the page
- Finds the cheapest available price for each card
- Compares combinations of 1–6 stores
- Shows how many cards each combination can fulfill
- Shows how much extra you're paying to consolidate into those stores
- Identifies cards that are difficult to find
- Lets you compare potential buying plans
- Highlights the exact listings for a chosen plan
- Can automatically click the correct listings on Snapcaster

It **does not place orders or purchase anything**. You still review your selections and complete purchases yourself.

---

# Quick Start

## 1. Search for your cards on Snapcaster

Go to Snapcaster and perform a normal multi-card search.

**Do not run the optimizer until the results have finished loading.**

<img width="1171" height="1097" alt="image" src="https://github.com/user-attachments/assets/60cec5b6-7de6-41ab-b729-72c39546772a" />

---

## 2. Open your browser console

### Chrome / Edge

Press:

**Windows:** `Ctrl + Shift + J`

**Mac:** `Cmd + Option + J`

You should see a panel appear with a **Console** tab.

> [!TIP]
> Your browser may display a warning about pasting code into the console. This is a browser security feature. Never paste console scripts you don't trust. Read/download this script from this repository rather than accepting modified copies from strangers.

<img width="1490" height="567" alt="image" src="https://github.com/user-attachments/assets/04a90191-1eff-4eab-9390-6f69f327bba6" />


---

## 3. Load the script

Copy the contents of `snapcaster.js`, paste it into the console, and press **Enter**.

<img width="2487" height="465" alt="image" src="https://github.com/user-attachments/assets/12ccc178-bf60-4840-b0fe-db3c033c8ad0" />

<img width="1178" height="847" alt="image" src="https://github.com/user-attachments/assets/ce780c3f-a9a8-4fc6-be98-514b5ef5492c" />

You should see:

```text
Snapcaster Optimizer loaded
```

You only need to paste the full script once for the current page.

<img width="1180" height="657" alt="image" src="https://github.com/user-attachments/assets/1830d685-aa40-46e2-8a8a-9d035efa5d14" />


---

## 4. Scan the Snapcaster results

Run:

```js
snapcaster.scrape();
```

The script will display summaries of the cards and stores it found.

<img width="627" height="565" alt="image" src="https://github.com/user-attachments/assets/8546ddda-4f8d-4584-a3ff-b75d8158d3f7" />

It's worth checking that the number of cards shown matches the number you searched for before continuing.

---

## 5. Find good store combinations

Run:

```js
snapcaster.optimize({ maxStores: 5 });
```

The optimizer will now test combinations of up to five stores.

For a large search, this can mean checking **millions of combinations**.

You'll see progress such as:

```text
5 stores: 10,000,000 / 19,757,815 (50.6%) | 145,000/sec | ETA ~1m 7s
```

The page may become temporarily unresponsive while this is running. That's normal.

### How many stores should I use?

I recommend starting with:

```js
snapcaster.optimize({ maxStores: 5 });
```

Five stores is usually a reasonable balance between search time and order consolidation.

You can try:

```js
snapcaster.optimize({ maxStores: 6 });
```

but the number of possible combinations increases dramatically. Depending on how many stores are in your results, a six-store search may take several minutes.

---

## 6. View the results

Once optimization finishes, run:

```js
snapcaster.results();
```

You'll get tables for the best 1-store, 2-store, 3-store, etc. combinations.

<img width="1600" height="308" alt="image" src="https://github.com/user-attachments/assets/4605f239-5ca4-420a-bd3d-7a2b90f8cc5a" />


A result might look like:

| Stores | Coverage | Total | Premium |
| --- | ---: | ---: | ---: |
| Store A + Store B + Store C + Store D + Store E | 65/66 | $443.37 | +$59.13 |

### What does "Premium" mean?

**Premium is NOT a fee.**

It's the difference between:

1. The price of the cards using this particular group of stores, and
2. The theoretical price you'd pay if you bought every card from whichever store has the single cheapest copy.

For example:

```text
65 cards
Chosen stores:          $443.37
Absolute cheapest:      $384.24
Premium:                 $59.13
```

That means you're paying about **$0.91 extra per card** to consolidate the order into those stores.

The theoretical minimum may require ordering from a huge number of different stores, so reaching it usually isn't practical once shipping and inconvenience are considered.

**Lower premium is good, but it isn't necessarily worth adding several more stores just to save a few dollars.**

---

# Inspecting a Plan

Once you find a combination you like, copy its store names from the results.

For example:

```js
const plan = snapcaster.findPlan(
  "MTG North + Fetch & Shock Games + House of Cards + Free Game + The Mythic Store"
);
```

You can then inspect it in several ways.

## See exactly what you'd buy

```js
snapcaster.printPlan(plan);
```

This groups the cards by store and shows:

- Card
- Price at that store
- Cheapest available price
- Premium you're paying

<img width="1603" height="1638" alt="image" src="https://github.com/user-attachments/assets/697b726a-123c-4601-ad80-c876e646ee5a" />


---

## Analyze missing cards and expensive choices

Run:

```js
snapcaster.analyze(plan);
```

This is especially useful if a plan covers something like `63/66` or `65/66`.

The report tells you which cards are missing, how much they're worth, where they're available, and which purchases in the plan have the largest premiums.

<img width="1604" height="531" alt="image" src="https://github.com/user-attachments/assets/feb10f91-6aba-4792-a037-a9e34ac5561b" />

A `63/66` plan for $390 isn't necessarily better than a `65/66` plan for $440 if the three missing cards cost $50.

---

# Finding Rare / Hard-to-Find Cards

Run:

```js
snapcaster.scarcity();
```

This shows cards available from five or fewer stores.

This is useful because sometimes one particular card effectively **forces** you to buy from a certain store.

For example:

```text
Card                    Stores Carrying    Cheapest
Rare Card A             1                  $8.50
Rare Card B             2                  $28.50
```

If you're already forced to order from that store, it may make sense to buy several other cards there even if they're slightly more expensive.

---

# Comparing Two Plans

You can save multiple plans:

```js
const planA = snapcaster.findPlan(
  "Store A + Store B + Store C + Store D"
);

const planB = snapcaster.findPlan(
  "Store A + Store B + Store C + Store E"
);
```

Then compare them:

```js
snapcaster.compare(planA, planB);
```

The comparison includes:

- Coverage
- Total price
- Premium
- Value of missing cards
- Which cards one plan covers that the other doesn't

<img width="1593" height="258" alt="image" src="https://github.com/user-attachments/assets/bb748689-d900-4b47-a29f-29090823ce0d" />


---

# Automatically Selecting the Cards

Once you've chosen a plan, the optimizer can locate the exact listings on the Snapcaster page.

## Highlight them first

Run:

```js
snapcaster.highlight(plan);
```

The listings selected by the optimizer will be highlighted in green.

<img width="1131" height="961" alt="image" src="https://github.com/user-attachments/assets/5a6d6f60-e937-4681-a8f3-5b0fac202c8d" />


Scroll through the page and spot-check a few cards to make sure everything looks correct.

## Dry run

Next run:

```js
snapcaster.select(plan);
```

**This does not click anything.**

It prints every card, store and price that the script intends to select.

## Select the cards

When you're satisfied, run:

```js
snapcaster.select(plan, { dryRun: false });
```

The script will click the `+` button for each selected listing.

After it finishes, check the Snapcaster cart summary:

<img width="741" height="499" alt="image" src="https://github.com/user-attachments/assets/3d82e2b8-ad56-4985-9c9d-fb8f7e92e503" />

**Always review the cart before continuing to any store or making a purchase.**

You will need to export the cart for any shops that don't have a buy now option and go manually check out on that store's site.

---

# Typical Workflow

For future orders, the whole process is basically:

```js
// 1. Read the current Snapcaster page
snapcaster.scrape();

// 2. Search store combinations
snapcaster.optimize({ maxStores: 5 });

// 3. Display the best results
snapcaster.results();

// 4. Pick an interesting result
const plan = snapcaster.findPlan(
  "Store A + Store B + Store C + Store D + Store E"
);

// 5. Inspect it
snapcaster.analyze(plan);
snapcaster.printPlan(plan);

// 6. Highlight the chosen listings
snapcaster.highlight(plan);

// 7. Dry run
snapcaster.select(plan);

// 8. Actually select them
snapcaster.select(plan, { dryRun: false });
```

---

# Things to Keep in Mind

### Shipping is not included

The optimizer currently compares **card prices only**.

It does not know:

- Shipping costs
- Free-shipping thresholds
- Store minimum orders
- Taxes
- Coupon codes

Use the results as a tool for finding sensible carts, not as a guarantee of the absolute cheapest final checkout price.

### The cheapest theoretical cart usually isn't realistic

If the theoretical minimum is $380 and a five-store cart is $420, that doesn't necessarily mean you're "overpaying" $40.

The $380 theoretical cart might require ordering from 15 different stores and paying shipping 15 times.

The goal of this tool is to find a useful compromise between:

**card price ↔ coverage ↔ number of stores**

### Snapcaster can change

This script reads Snapcaster's webpage directly. If Snapcaster changes the structure of its site, parts of the script may stop working.

In particular, always use `snapcaster.highlight(plan)` or the default dry run before automatically selecting cards.

### The browser may freeze during optimization

The optimizer runs locally in your browser.

Searching five or six store combinations can involve millions of calculations, so the Snapcaster tab may temporarily appear frozen.

Let it finish unless your browser actually reports that the page has crashed.

---

# FAQ

### Does this buy cards for me?

No.

It can select listings on Snapcaster, but you are still responsible for reviewing the cart and completing purchases from the individual stores.

### Does this send my card list anywhere?

No additional service is used by the optimizer. The calculations happen locally in your browser using the Snapcaster results already loaded on the page.

### Do I need Snapcaster Pro?

The script itself doesn't require a particular Snapcaster plan, but your Snapcaster account determines how many cards you can search for at once.

### Why isn't the cheapest plan necessarily first?

There are multiple things worth optimizing:

- Number of cards covered
- Number of stores
- Total price
- Premium over the market minimum

A $300 cart covering 40/70 cards isn't necessarily more useful than a $450 cart covering 69/70.

### Why can't it find one of my cards?

Run:

```js
snapcaster.analyze(plan);
```

or:

```js
snapcaster.scarcity();
```

The card may only be stocked by a store outside your chosen combination.

---

# Disclaimer

This project is provided as-is.

Prices and inventory can change between running the optimizer and completing an order. Always verify card printing, condition, quantity, price, shipping and store policies before purchasing.

This project is not affiliated with or endorsed by Snapcaster or any game store referenced by its results.
