/**
 * Snapcaster Optimizer
 *
 * Browser-console utility for optimizing multi-store MTG purchases
 * on snapcaster.ca.
 *
 * Usage:
 *
 *   snapcaster.scrape();
 *   snapcaster.optimize({ maxStores: 5 });
 *   snapcaster.results();
 *
 *   const plan = snapcaster.findPlan(
 *     "MTG North + Fetch & Shock Games + House of Cards + Free Game"
 *   );
 *
 *   snapcaster.analyze(plan);
 *   snapcaster.highlight(plan);
 *   snapcaster.select(plan); // dry run
 *   snapcaster.select(plan, { dryRun: false }); // actually click
 */

(() => {
  "use strict";

  // ============================================================
  // Configuration / constants
  // ============================================================

  const SELECTORS = {
    cardContainer:
      ".rounded-lg.border.bg-card.text-card-foreground.shadow-sm.w-full",

    storeRow:
      ".flex.flex-row:not(.font-bold)",

    storeName:
      ".text-sm.font-bold:not(.capitalize)",

    price:
      ".flex.flex-row.gap-2.font-bold > div:nth-child(2)",
  };

  const HIGHLIGHT_CLASS = "snapcaster-optimizer-selected";
  const STYLE_ID = "snapcaster-optimizer-styles";

  const state = {
    data: null,
    optimization: null,
  };

  // ============================================================
  // General helpers
  // ============================================================

  function parsePrice(text) {
    if (!text) return null;

    const match = text
      .replace(/,/g, "")
      .match(/\$?\s*(\d+(?:\.\d+)?)/);

    return match ? Number(match[1]) : null;
  }

  function getDirectText(element) {
    if (!element) return "";

    return [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim())
      .filter(Boolean)
      .join(" ");
  }

  function money(value) {
    return `$${value.toFixed(2)}`;
  }

  function premium(value) {
    return `+$${value.toFixed(2)}`;
  }

  function choose(n, r) {
    if (r > n) return 0;

    let result = 1;

    for (let i = 1; i <= r; i++) {
      result = result * (n - r + i) / i;
    }

    return Math.round(result);
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) {
      return "?";
    }

    if (seconds < 60) {
      return `${seconds.toFixed(0)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);

    return `${minutes}m ${secs}s`;
  }

  function requireData() {
    if (!state.data) {
      throw new Error(
        "No scraped data. Run snapcaster.scrape() first."
      );
    }

    return state.data;
  }

  function requireOptimization() {
    if (!state.optimization) {
      throw new Error(
        "No optimization results. Run snapcaster.optimize() first."
      );
    }

    return state.optimization;
  }

  // ============================================================
  // Scraper
  // ============================================================

  function scrape() {
    const candidateContainers = [
      ...document.querySelectorAll(SELECTORS.cardContainer),
    ];

    const cards = [];

    for (const container of candidateContainers) {
      const rows = [
        ...container.querySelectorAll(SELECTORS.storeRow),
      ];

      const listings = [];

      for (const row of rows) {
        const storeNameEl =
          row.querySelector(SELECTORS.storeName);

        const priceEl =
          row.querySelector(SELECTORS.price);

        if (!storeNameEl || !priceEl) {
          continue;
        }

        const store =
          storeNameEl.textContent.trim();

        const price =
          parsePrice(priceEl.textContent);

        if (!store || price === null) {
          continue;
        }

        listings.push({
          store,
          price,
          row,
        });
      }

      // Generic Tailwind selector can match unrelated components.
      if (!listings.length) {
        continue;
      }

      const possibleHeadings = [
        ...container.querySelectorAll(
          "h1, h2, h3, h4, h5, h6, .font-bold, .font-semibold"
        ),
      ]
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .filter(
          text =>
            !listings.some(
              listing => listing.store === text
            )
        );

      const name =
        possibleHeadings[0] ||
        getDirectText(container) ||
        `Unknown Card ${cards.length + 1}`;

      const prices =
        listings.map(listing => listing.price);

      const sortedPrices =
        [...prices].sort((a, b) => a - b);

      const middle =
        Math.floor(sortedPrices.length / 2);

      const medianPrice =
        sortedPrices.length % 2
          ? sortedPrices[middle]
          : (
              sortedPrices[middle - 1] +
              sortedPrices[middle]
            ) / 2;

      cards.push({
        name,
        element: container,
        listings,

        stats: {
          listingCount: listings.length,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          medianPrice,
        },
      });
    }

    // ----------------------------------------------------------
    // Collapse multiple printings at the same store.
    //
    // One card + one store = cheapest available listing there.
    // ----------------------------------------------------------

    const stores = new Map();

    for (const card of cards) {
      const cheapestByStore = new Map();

      for (const listing of card.listings) {
        const existing =
          cheapestByStore.get(listing.store);

        if (
          !existing ||
          listing.price < existing.price
        ) {
          cheapestByStore.set(
            listing.store,
            listing
          );
        }
      }

      for (
        const listing of cheapestByStore.values()
      ) {
        if (!stores.has(listing.store)) {
          stores.set(listing.store, {
            name: listing.store,
            cards: [],
          });
        }

        const cheapestPrice =
          card.stats.minPrice;

        stores.get(listing.store).cards.push({
          card: card.name,
          price: listing.price,
          cheapestPrice,

          premium:
            listing.price - cheapestPrice,

          listing,
        });
      }
    }

    // ----------------------------------------------------------
    // Store summary
    // ----------------------------------------------------------

    const storeSummary =
      [...stores.values()]
        .map(store => {
          const total =
            store.cards.reduce(
              (sum, card) =>
                sum + card.price,
              0
            );

          const minimum =
            store.cards.reduce(
              (sum, card) =>
                sum + card.cheapestPrice,
              0
            );

          const consolidationPremium =
            total - minimum;

          const cheapestCount =
            store.cards.filter(
              card =>
                Math.abs(card.premium) < 0.001
            ).length;

          const reasonableCount =
            store.cards.filter(card => {
              const allowed =
                Math.max(
                  0.5,
                  card.cheapestPrice * 0.1
                );

              return card.premium <= allowed;
            }).length;

          return {
            store: store.name,
            cardCount: store.cards.length,
            total,
            minimum,
            premium: consolidationPremium,

            averagePremium:
              store.cards.length
                ? consolidationPremium /
                  store.cards.length
                : 0,

            cheapestCount,
            reasonableCount,
          };
        })
        .sort((a, b) => {
          if (b.cardCount !== a.cardCount) {
            return b.cardCount - a.cardCount;
          }

          return a.premium - b.premium;
        });

    const theoreticalMinimum =
      cards.reduce(
        (sum, card) =>
          sum + card.stats.minPrice,
        0
      );

    state.data = {
      cards,
      stores,
      storeSummary,
      theoreticalMinimum,
    };

    // Any old optimization references old DOM/data.
    state.optimization = null;

    console.log(
      "%cSnapcaster scrape complete",
      "font-weight:bold;font-size:18px"
    );

    console.log(
      `${cards.length} cards | ` +
      `${stores.size} stores | ` +
      `${cards.reduce(
        (sum, card) =>
          sum + card.listings.length,
        0
      )} listings`
    );

    console.log(
      `Theoretical minimum: ${money(theoreticalMinimum)}`
    );

    console.log("\nCARD SUMMARY");

    console.table(
      cards.map(card => ({
        Card: card.name,
        Listings: card.stats.listingCount,
        Min: money(card.stats.minPrice),
        Median: money(card.stats.medianPrice),
        Max: money(card.stats.maxPrice),
      }))
    );

    console.log("\nSTORE SUMMARY");

    console.table(
      storeSummary.map(store => ({
        Store: store.store,
        Cards:
          `${store.cardCount}/${cards.length}`,
        Total:
          money(store.total),

        "Minimum For Same Cards":
          money(store.minimum),

        Premium:
          premium(store.premium),

        "Avg Premium":
          premium(store.averagePremium),

        Cheapest:
          store.cheapestCount,

        "Reasonably Priced":
          store.reasonableCount,
      }))
    );

    return state.data;
  }

  // ============================================================
  // Optimizer
  // ============================================================

  function optimize(options = {}) {
    const data = requireData();

    const config = {
      maxStores: 5,
      keepPerCoverage: 10,
      progressEvery: 250_000,
      ...options,
    };

    const {
      cards,
      stores,
      theoreticalMinimum,
    } = data;

    const storeList =
      [...stores.values()];

    const storeNames =
      storeList.map(store => store.name);

    const cardCount = cards.length;
    const storeCount = storeList.length;

    // ----------------------------------------------------------
    // Numeric hot-path representation
    // ----------------------------------------------------------

    const cardIndexByName =
      new Map(
        cards.map(
          (card, index) =>
            [card.name, index]
        )
      );

    const priceMatrix =
      Array.from(
        { length: storeCount },
        () =>
          new Float64Array(cardCount)
            .fill(Infinity)
      );

    const listingMatrix =
      Array.from(
        { length: storeCount },
        () =>
          new Array(cardCount).fill(null)
      );

    storeList.forEach(
      (store, storeIndex) => {
        for (const storeCard of store.cards) {
          const cardIndex =
            cardIndexByName.get(
              storeCard.card
            );

          if (cardIndex === undefined) {
            continue;
          }

          priceMatrix
            [storeIndex]
            [cardIndex] =
              storeCard.price;

          listingMatrix
            [storeIndex]
            [cardIndex] =
              storeCard.listing;
        }
      }
    );

    const minimumPrices =
      new Float64Array(
        cards.map(
          card => card.stats.minPrice
        )
      );

    // ----------------------------------------------------------
    // Lightweight combination evaluator
    // ----------------------------------------------------------

    function evaluateIndices(indices) {
      let covered = 0;
      let total = 0;
      let minimumForCovered = 0;

      for (
        let cardIndex = 0;
        cardIndex < cardCount;
        cardIndex++
      ) {
        let bestPrice = Infinity;

        for (
          let i = 0;
          i < indices.length;
          i++
        ) {
          const price =
            priceMatrix
              [indices[i]]
              [cardIndex];

          if (price < bestPrice) {
            bestPrice = price;
          }
        }

        if (bestPrice !== Infinity) {
          covered++;
          total += bestPrice;

          minimumForCovered +=
            minimumPrices[cardIndex];
        }
      }

      return {
        indices: [...indices],
        storeCount: indices.length,
        covered,
        missingCount:
          cardCount - covered,
        total,
        minimumForCovered,

        premium:
          total - minimumForCovered,
      };
    }

    // ----------------------------------------------------------
    // Retain only best N plans for each
    // store-count + coverage combination.
    // ----------------------------------------------------------

    const retained = new Map();

    function retainPlan(plan) {
      if (!retained.has(plan.storeCount)) {
        retained.set(
          plan.storeCount,
          new Map()
        );
      }

      const byCoverage =
        retained.get(plan.storeCount);

      if (!byCoverage.has(plan.covered)) {
        byCoverage.set(
          plan.covered,
          []
        );
      }

      const bucket =
        byCoverage.get(plan.covered);

      if (
        bucket.length >=
          config.keepPerCoverage &&
        plan.total >=
          bucket[bucket.length - 1].total
      ) {
        return;
      }

      bucket.push(plan);

      bucket.sort(
        (a, b) => a.total - b.total
      );

      if (
        bucket.length >
        config.keepPerCoverage
      ) {
        bucket.length =
          config.keepPerCoverage;
      }
    }

    // ----------------------------------------------------------
    // Streaming combination search
    // ----------------------------------------------------------

    function searchStoreCount(targetSize) {
      const indices =
        new Array(targetSize);

      let evaluated = 0;

      const totalCombinations =
        choose(storeCount, targetSize);

      const start =
        performance.now();

      console.log(
        `Searching ${targetSize} stores: ` +
        `${totalCombinations.toLocaleString()} combinations`
      );

      function walk(depth, startIndex) {
        if (depth === targetSize) {
          retainPlan(
            evaluateIndices(indices)
          );

          evaluated++;

          if (
            config.progressEvery &&
            evaluated %
              config.progressEvery === 0
          ) {
            const elapsed =
              (performance.now() - start) /
              1000;

            const rate =
              evaluated / elapsed;

            const remaining =
              totalCombinations -
              evaluated;

            console.log(
              `${targetSize} stores: ` +
              `${evaluated.toLocaleString()} / ` +
              `${totalCombinations.toLocaleString()} ` +
              `(${(
                evaluated /
                totalCombinations *
                100
              ).toFixed(1)}%) | ` +
              `${Math.round(rate).toLocaleString()}/sec | ` +
              `ETA ~${formatDuration(
                remaining / rate
              )}`
            );
          }

          return;
        }

        const remainingSlots =
          targetSize - depth;

        const lastStart =
          storeCount - remainingSlots;

        for (
          let i = startIndex;
          i <= lastStart;
          i++
        ) {
          indices[depth] = i;
          walk(depth + 1, i + 1);
        }
      }

      walk(0, 0);

      console.log(
        `${targetSize}-store search complete ` +
        `in ${formatDuration(
          (performance.now() - start) /
          1000
        )}`
      );
    }

    // ----------------------------------------------------------
    // Search
    // ----------------------------------------------------------

    console.log(
      "%cSnapcaster optimization started",
      "font-weight:bold;font-size:18px"
    );

    console.log(
      `${cardCount} cards | ${storeCount} stores`
    );

    console.log(
      `Theoretical minimum: ` +
      money(theoreticalMinimum)
    );

    const start =
      performance.now();

    for (
      let size = 1;
      size <= config.maxStores;
      size++
    ) {
      searchStoreCount(size);
    }

    // ----------------------------------------------------------
    // Flatten retained plans
    // ----------------------------------------------------------

    const retainedPlans = [];

    for (
      const byCoverage
      of retained.values()
    ) {
      for (
        const plans
        of byCoverage.values()
      ) {
        retainedPlans.push(...plans);
      }
    }

    // ----------------------------------------------------------
    // Hydration
    //
    // Expensive human-friendly representation is only created
    // for plans we actually inspect.
    // ----------------------------------------------------------

    function hydratePlan(lightPlan) {
      if (!lightPlan) {
        return null;
      }

      // Already hydrated.
      if (
        lightPlan.assignments &&
        lightPlan.stores
      ) {
        return lightPlan;
      }

      const assignments = [];
      const missing = [];

      for (
        let cardIndex = 0;
        cardIndex < cardCount;
        cardIndex++
      ) {
        let bestStoreIndex = null;
        let bestPrice = Infinity;

        for (
          const storeIndex
          of lightPlan.indices
        ) {
          const price =
            priceMatrix
              [storeIndex]
              [cardIndex];

          if (price < bestPrice) {
            bestPrice = price;
            bestStoreIndex =
              storeIndex;
          }
        }

        if (bestStoreIndex === null) {
          missing.push(
            cards[cardIndex].name
          );

          continue;
        }

        assignments.push({
          card:
            cards[cardIndex].name,

          store:
            storeNames[
              bestStoreIndex
            ],

          price:
            bestPrice,

          cheapestPrice:
            minimumPrices[
              cardIndex
            ],

          premium:
            bestPrice -
            minimumPrices[
              cardIndex
            ],

          listing:
            listingMatrix
              [bestStoreIndex]
              [cardIndex],
        });
      }

      const byStore = new Map();

      for (
        const assignment
        of assignments
      ) {
        if (
          !byStore.has(
            assignment.store
          )
        ) {
          byStore.set(
            assignment.store,
            []
          );
        }

        byStore
          .get(assignment.store)
          .push(assignment);
      }

      return {
        ...lightPlan,

        stores:
          lightPlan.indices.map(
            index =>
              storeNames[index]
          ),

        assignments,
        missing,
        byStore,

        averagePremium:
          assignments.length
            ? lightPlan.premium /
              assignments.length
            : 0,
      };
    }

    // ----------------------------------------------------------
    // Pareto filtering
    // ----------------------------------------------------------

    function isDominated(plan) {
      return retainedPlans.some(
        other => {
          if (other === plan) {
            return false;
          }

          const noMoreStores =
            other.storeCount <=
            plan.storeCount;

          const atLeastCoverage =
            other.covered >=
            plan.covered;

          const noMoreExpensive =
            other.total <=
            plan.total;

          const strict =
            other.storeCount <
              plan.storeCount ||
            other.covered >
              plan.covered ||
            other.total <
              plan.total;

          return (
            noMoreStores &&
            atLeastCoverage &&
            noMoreExpensive &&
            strict
          );
        }
      );
    }

    const paretoPlans =
      retainedPlans
        .filter(
          plan => !isDominated(plan)
        )
        .sort((a, b) => {
          if (
            b.covered !== a.covered
          ) {
            return (
              b.covered -
              a.covered
            );
          }

          if (
            a.storeCount !==
            b.storeCount
          ) {
            return (
              a.storeCount -
              b.storeCount
            );
          }

          return a.total - b.total;
        });

    const fullCoveragePlans =
      retainedPlans
        .filter(
          plan =>
            plan.covered === cardCount
        )
        .sort((a, b) => {
          if (
            a.storeCount !==
            b.storeCount
          ) {
            return (
              a.storeCount -
              b.storeCount
            );
          }

          return a.total - b.total;
        });

    state.optimization = {
      config,

      storeNames,
      priceMatrix,
      listingMatrix,
      minimumPrices,

      retained,
      retainedPlans,
      paretoPlans,
      fullCoveragePlans,

      hydratePlan,
    };

    console.log(
      "%cOptimization complete",
      "font-weight:bold;font-size:18px"
    );

    console.log(
      `Finished in ${formatDuration(
        (performance.now() - start) /
        1000
      )}`
    );

    console.log(
      `${retainedPlans.length} useful plans retained.`
    );

    return state.optimization;
  }

  // ============================================================
  // Results
  // ============================================================

  function getPlansForStoreCount(count) {
    const optimization =
      requireOptimization();

    const byCoverage =
      optimization.retained.get(count);

    if (!byCoverage) {
      return [];
    }

    const plans = [];

    for (
      const bucket
      of byCoverage.values()
    ) {
      plans.push(...bucket);
    }

    return plans.sort((a, b) => {
      if (b.covered !== a.covered) {
        return b.covered - a.covered;
      }

      return a.total - b.total;
    });
  }

  function summarizePlan(plan) {
    const data = requireData();
    const optimization =
      requireOptimization();

    return {
      Stores:
        plan.indices
          .map(
            index =>
              optimization
                .storeNames[index]
          )
          .join(" + "),

      Coverage:
        `${plan.covered}/${data.cards.length}`,

      Missing:
        plan.missingCount,

      Total:
        money(plan.total),

      "Minimum For Covered":
        money(
          plan.minimumForCovered
        ),

      Premium:
        premium(plan.premium),

      "Avg Premium":
        plan.covered
          ? premium(
              plan.premium /
              plan.covered
            )
          : "-",
    };
  }

  function results({
    top = 15,
    pareto = 30,
  } = {}) {
    const optimization =
      requireOptimization();

    for (
      let size = 1;
      size <=
        optimization.config.maxStores;
      size++
    ) {
      console.log(
        `%cBEST ${size}-STORE PLANS`,
        "font-weight:bold;font-size:15px"
      );

      console.table(
        getPlansForStoreCount(size)
          .slice(0, top)
          .map(summarizePlan)
      );
    }

    console.log(
      "%cPARETO-EFFICIENT PLANS",
      "font-weight:bold;font-size:15px"
    );

    console.table(
      optimization.paretoPlans
        .slice(0, pareto)
        .map(summarizePlan)
    );

    if (
      optimization
        .fullCoveragePlans.length
    ) {
      const first =
        optimization
          .fullCoveragePlans[0];

      console.log(
        `%cFull coverage found with ` +
        `${first.storeCount} stores.`,
        "font-weight:bold"
      );
    } else {
      const maxCoverage =
        Math.max(
          ...optimization
            .retainedPlans
            .map(plan => plan.covered)
        );

      console.log(
        `Maximum coverage: ` +
        `${maxCoverage}/` +
        `${state.data.cards.length}`
      );
    }

    return optimization.paretoPlans;
  }

  // ============================================================
  // Find a retained plan
  // ============================================================

  function findPlan(input) {
    const optimization =
      requireOptimization();

    const names =
      Array.isArray(input)
        ? input
        : input
            .split("+")
            .map(name => name.trim())
            .filter(Boolean);

    const wanted =
      [...names]
        .sort()
        .join("|");

    const match =
      optimization
        .retainedPlans
        .find(plan => {
          const planNames =
            plan.indices
              .map(
                index =>
                  optimization
                    .storeNames[index]
              )
              .sort()
              .join("|");

          return planNames === wanted;
        });

    if (!match) {
      console.warn(
        `Plan was not retained: ` +
        names.join(" + ")
      );

      return null;
    }

    return match;
  }

  // ============================================================
  // Print exact purchases
  // ============================================================

  function printPlan(lightPlan) {
    const optimization =
      requireOptimization();

    const data =
      requireData();

    const plan =
      optimization
        .hydratePlan(lightPlan);

    if (!plan) {
      return null;
    }

    console.log(
      `%c${plan.stores.join(" + ")}`,
      "font-weight:bold;font-size:16px"
    );

    console.log(
      `${plan.covered}/${data.cards.length} cards | ` +
      `${plan.storeCount} stores | ` +
      `${money(plan.total)} | ` +
      `${premium(plan.premium)} premium`
    );

    for (
      const [
        storeName,
        assignments,
      ] of plan.byStore
    ) {
      const subtotal =
        assignments.reduce(
          (sum, item) =>
            sum + item.price,
          0
        );

      const storePremium =
        assignments.reduce(
          (sum, item) =>
            sum + item.premium,
          0
        );

      console.log(
        `%c${storeName}`,
        "font-weight:bold"
      );

      console.log(
        `${assignments.length} cards | ` +
        `${money(subtotal)} | ` +
        `${premium(storePremium)} premium`
      );

      console.table(
        assignments
          .slice()
          .sort(
            (a, b) =>
              b.premium -
              a.premium
          )
          .map(item => ({
            Card: item.card,
            Price:
              money(item.price),
            Cheapest:
              money(
                item.cheapestPrice
              ),
            Premium:
              premium(
                item.premium
              ),
          }))
      );
    }

    if (plan.missing.length) {
      console.log(
        `%cMissing ${plan.missing.length} cards`,
        "font-weight:bold"
      );

      console.table(
        plan.missing.map(
          card => ({ Card: card })
        )
      );
    }

    return plan;
  }

  // ============================================================
  // Availability / scarcity
  // ============================================================

  function buildAvailability() {
    const { cards, stores } =
      requireData();

    const cardByName =
      new Map(
        cards.map(
          card => [card.name, card]
        )
      );

    const availability =
      new Map(
        cards.map(
          card => [card.name, []]
        )
      );

    for (
      const store
      of stores.values()
    ) {
      for (
        const storeCard
        of store.cards
      ) {
        const card =
          cardByName.get(
            storeCard.card
          );

        availability
          .get(storeCard.card)
          ?.push({
            store: store.name,
            price: storeCard.price,

            premium:
              storeCard.price -
              card.stats.minPrice,

            listing:
              storeCard.listing,
          });
      }
    }

    for (
      const options
      of availability.values()
    ) {
      options.sort(
        (a, b) =>
          a.price - b.price
      );
    }

    return availability;
  }

  function scarcity(maxStores = 5) {
    const { cards } =
      requireData();

    const availability =
      buildAvailability();

    const scarce =
      cards
        .map(card => {
          const options =
            availability.get(
              card.name
            ) || [];

          return {
            card: card.name,
            storeCount:
              options.length,
            cheapest:
              card.stats.minPrice,
            options,
          };
        })
        .filter(
          card =>
            card.storeCount <=
            maxStores
        )
        .sort((a, b) => {
          if (
            a.storeCount !==
            b.storeCount
          ) {
            return (
              a.storeCount -
              b.storeCount
            );
          }

          return (
            b.cheapest -
            a.cheapest
          );
        });

    console.log(
      `%cSCARCITY REPORT — <= ${maxStores} stores`,
      "font-weight:bold;font-size:16px"
    );

    console.table(
      scarce.map(card => ({
        Card: card.card,

        "Stores Carrying":
          card.storeCount,

        Cheapest:
          money(card.cheapest),

        Stores:
          card.options
            .map(
              option =>
                `${option.store} ` +
                `(${money(option.price)})`
            )
            .join(", "),
      }))
    );

    return scarce;
  }

  // ============================================================
  // Plan analysis
  // ============================================================

  function analyze(lightPlan) {
    const { cards } =
      requireData();

    const optimization =
      requireOptimization();

    const availability =
      buildAvailability();

    const cardByName =
      new Map(
        cards.map(
          card => [card.name, card]
        )
      );

    const plan =
      optimization
        .hydratePlan(lightPlan);

    if (!plan) {
      return null;
    }

    console.log(
      "%cPLAN ANALYSIS",
      "font-weight:bold;font-size:18px"
    );

    console.log(
      plan.stores.join(" + ")
    );

    console.log(
      `${plan.covered}/${cards.length} cards | ` +
      `${money(plan.total)} | ` +
      `${premium(plan.premium)} premium`
    );

    if (plan.missing.length) {
      console.log(
        `%cMISSING ${plan.missing.length} CARDS`,
        "font-weight:bold;font-size:15px"
      );

      console.table(
        plan.missing.map(
          cardName => {
            const card =
              cardByName.get(
                cardName
              );

            const options =
              availability.get(
                cardName
              ) || [];

            return {
              Card: cardName,

              "Cheapest Price":
                money(
                  card.stats.minPrice
                ),

              "Stores Carrying":
                options.length,

              "Cheapest Store":
                options[0]?.store ??
                "NONE",

              "Price There":
                options[0]
                  ? money(
                      options[0].price
                    )
                  : "-",

              "All Stores":
                options
                  .map(
                    option =>
                      `${option.store} ` +
                      `(${money(
                        option.price
                      )})`
                  )
                  .join(", "),
            };
          }
        )
      );

      const missingMinimum =
        plan.missing.reduce(
          (sum, cardName) =>
            sum +
            cardByName.get(cardName)
              .stats.minPrice,
          0
        );

      console.log(
        `Missing theoretical value: ` +
        `${money(missingMinimum)}`
      );

      console.log(
        `Plan + cheapest missing cards: ` +
        `${money(
          plan.total +
          missingMinimum
        )} before additional shipping`
      );
    }

    console.log(
      "%cLARGEST PREMIUMS",
      "font-weight:bold;font-size:15px"
    );

    console.table(
      [...plan.assignments]
        .sort(
          (a, b) =>
            b.premium -
            a.premium
        )
        .slice(0, 15)
        .map(item => ({
          Card: item.card,
          Store: item.store,
          Price: money(item.price),

          Cheapest:
            money(
              item.cheapestPrice
            ),

          Premium:
            premium(
              item.premium
            ),

          "Premium %":
            item.cheapestPrice
              ? `${(
                  item.premium /
                  item.cheapestPrice *
                  100
                ).toFixed(1)}%`
              : "-",
        }))
    );

    return plan;
  }

  // ============================================================
  // Plan comparison
  // ============================================================

  function compare(planA, planB) {
    const { cards } =
      requireData();

    const optimization =
      requireOptimization();

    const cardByName =
      new Map(
        cards.map(
          card => [card.name, card]
        )
      );

    const a =
      optimization
        .hydratePlan(planA);

    const b =
      optimization
        .hydratePlan(planB);

    function missingValue(plan) {
      return plan.missing.reduce(
        (sum, cardName) =>
          sum +
          cardByName.get(cardName)
            .stats.minPrice,
        0
      );
    }

    const aMissing =
      missingValue(a);

    const bMissing =
      missingValue(b);

    console.log(
      "%cPLAN COMPARISON",
      "font-weight:bold;font-size:18px"
    );

    console.table([
      {
        Plan: "A",
        Stores:
          a.stores.join(" + "),
        Coverage:
          `${a.covered}/${cards.length}`,
        Total:
          money(a.total),
        Premium:
          premium(a.premium),
        "Missing Value":
          money(aMissing),
        "Total + Missing":
          money(
            a.total + aMissing
          ),
      },
      {
        Plan: "B",
        Stores:
          b.stores.join(" + "),
        Coverage:
          `${b.covered}/${cards.length}`,
        Total:
          money(b.total),
        Premium:
          premium(b.premium),
        "Missing Value":
          money(bMissing),
        "Total + Missing":
          money(
            b.total + bMissing
          ),
      },
    ]);

    const aCards =
      new Set(
        a.assignments.map(
          item => item.card
        )
      );

    const bCards =
      new Set(
        b.assignments.map(
          item => item.card
        )
      );

    const onlyA =
      [...aCards].filter(
        card => !bCards.has(card)
      );

    const onlyB =
      [...bCards].filter(
        card => !aCards.has(card)
      );

    if (onlyA.length) {
      console.log(
        "%cCovered by A but missing from B",
        "font-weight:bold"
      );

      console.table(
        onlyA.map(card => ({
          Card: card,
          "Minimum Value":
            money(
              cardByName.get(card)
                .stats.minPrice
            ),
        }))
      );
    }

    if (onlyB.length) {
      console.log(
        "%cCovered by B but missing from A",
        "font-weight:bold"
      );

      console.table(
        onlyB.map(card => ({
          Card: card,
          "Minimum Value":
            money(
              cardByName.get(card)
                .stats.minPrice
            ),
        }))
      );
    }

    return { a, b };
  }

  // ============================================================
  // DOM interaction
  // ============================================================

  function installStyles() {
    if (
      document.getElementById(
        STYLE_ID
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style"
      );

    style.id = STYLE_ID;

    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 3px solid #22c55e !important;
        outline-offset: 2px !important;
        background: rgba(34, 197, 94, 0.10) !important;
      }
    `;

    document.head.appendChild(style);
  }

  function getAddButton(listing) {
    if (!listing?.row) {
      return null;
    }

    const buttons = [
      ...listing.row.querySelectorAll(
        "button"
      ),
    ];

    // Fail closed rather than guess.
    if (buttons.length !== 1) {
      return null;
    }

    return buttons[0];
  }

  function resolvePlan(lightPlan) {
    const optimization =
      requireOptimization();

    const plan =
      optimization
        .hydratePlan(lightPlan);

    const resolved = [];
    const failed = [];

    for (
      const assignment
      of plan.assignments
    ) {
      const row =
        assignment.listing?.row;

      const button =
        getAddButton(
          assignment.listing
        );

      if (!row || !button) {
        failed.push({
          card: assignment.card,
          store: assignment.store,
          price: assignment.price,

          reason:
            !row
              ? "Missing row reference"
              : "Could not uniquely identify add button",
        });

        continue;
      }

      resolved.push({
        ...assignment,
        row,
        button,
      });
    }

    return {
      plan,
      resolved,
      failed,
    };
  }

  function clearHighlights() {
    document
      .querySelectorAll(
        `.${HIGHLIGHT_CLASS}`
      )
      .forEach(
        element =>
          element.classList.remove(
            HIGHLIGHT_CLASS
          )
      );
  }

  function highlight(lightPlan) {
    installStyles();
    clearHighlights();

    const result =
      resolvePlan(lightPlan);

    for (
      const item
      of result.resolved
    ) {
      item.row.classList.add(
        HIGHLIGHT_CLASS
      );
    }

    console.log(
      `Highlighted ` +
      `${result.resolved.length}/` +
      `${result.plan.assignments.length} listings.`
    );

    if (result.failed.length) {
      console.warn(
        `${result.failed.length} listings could not be resolved.`
      );

      console.table(
        result.failed.map(
          item => ({
            Card: item.card,
            Store: item.store,
            Price:
              money(item.price),
            Reason:
              item.reason,
          })
        )
      );
    }

    return result;
  }

  // ============================================================
  // Select listings
  // ============================================================

  function select(
    lightPlan,
    {
      dryRun = true,
      delay = 150,
    } = {}
  ) {
    const result =
      resolvePlan(lightPlan);

    if (result.failed.length) {
      console.error(
        `Selection aborted: ` +
        `${result.failed.length} listings ` +
        `could not be resolved.`
      );

      console.table(result.failed);

      return result;
    }

    console.table(
      result.resolved.map(
        item => ({
          Card: item.card,
          Store: item.store,
          Price:
            money(item.price),
        })
      )
    );

    if (dryRun) {
      console.log(
        "%cDRY RUN — nothing clicked.",
        "font-weight:bold;color:#d97706"
      );

      console.log(
        "Run snapcaster.select(plan, { dryRun: false }) to select these listings."
      );

      return result;
    }

    console.log(
      `Selecting ` +
      `${result.resolved.length} listings...`
    );

    result.resolved.forEach(
      (item, index) => {
        setTimeout(() => {
          item.button.click();

          console.log(
            `[${index + 1}/` +
            `${result.resolved.length}] ` +
            `${item.card} — ` +
            `${item.store} — ` +
            `${money(item.price)}`
          );
        }, index * delay);
      }
    );

    setTimeout(() => {
      console.log(
        `%cFinished selecting ` +
        `${result.resolved.length} listings.`,
        "font-weight:bold;color:green"
      );
    }, result.resolved.length * delay + 100);

    return result;
  }

  // ============================================================
  // Public API
  // ============================================================

  window.snapcaster = {
    // Main workflow
    scrape,
    optimize,
    results,
    findPlan,

    // Inspection
    printPlan,
    analyze,
    compare,
    scarcity,

    // DOM actions
    highlight,
    clearHighlights,
    select,

    // Useful advanced access
    getPlansForStoreCount,

    // Read-only-ish state access for debugging.
    get data() {
      return state.data;
    },

    get optimization() {
      return state.optimization;
    },
  };

  console.log(
    "%cSnapcaster Optimizer loaded",
    "font-weight:bold;font-size:18px"
  );

  console.log(`
Typical workflow:

  snapcaster.scrape();

  snapcaster.optimize({
    maxStores: 5
  });

  snapcaster.results();

  const plan = snapcaster.findPlan(
    "Store A + Store B + Store C"
  );

  snapcaster.analyze(plan);
  snapcaster.printPlan(plan);
  snapcaster.highlight(plan);

  // Dry run:
  snapcaster.select(plan);

  // Actually select:
  snapcaster.select(plan, { dryRun: false });
  `);
})();
