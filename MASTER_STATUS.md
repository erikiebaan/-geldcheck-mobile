# GELDCHECK — MASTER STATUS

**Purpose:** canonical handover document for continuing Geldcheck in a new ChatGPT conversation without losing the validated state.

**Repository:** `erikiebaan/-geldcheck-mobile`  
**Status date:** 2026-09-06  
**Rule:** the repository code is the source of truth. This document explains the validated state, evidence, caveats, and next step. Do not change production logic merely to make a test green.

---

## 1. Current validated architecture

- Main calculation/UI analysis engine: **GeldcheckEngine v1.2** (`engine.js`)
- Future Layer normalization: `future_layer.js`
- Future retirement bridge currently used in the advanced test work: **Future Bridge v0.41** (`future_bridge_v041.js`)
- Answer Engine: **v0.1** (`answer_engine.js`)
- Mobile live route uses the same UI payload shape and `GeldcheckEngine.analyze()` route covered by the live E2E suite.

Core design principle: distinguish money that exists now, money that is contractually/certainly available later, uncertain future money, restricted money, income streams, and future expenses. Timing and liquidity matter.

---

## 2. Validated test stack

### Adversarial fuzz
**Path:** `adversarial-fuzz100k-v3/index.html`  
**Build:** AF3 · seed 260906 · Future Bridge v0.41  
**Result:** **100,000 households / 5,000 pair checks / 0 anomalies**

Checks include:
- crashes/exceptions;
- NaN/Infinity;
- negative accounting fields where forbidden;
- invalid timing;
- uncertain/restricted/illiquid money being consumed;
- local contradictions such as extra cash producing a worse answer.

Historical note: AF1 initially showed 100 anomalies. Investigation showed the fuzz audit incorrectly attributed an item's consumption to the first arbitrary ledger injection. AF2 then exposed browser caching of the old bridge. AF3 uses per-item injection attribution plus a cache-busted v0.41 bridge and is the valid regression version.

### Extreme Edge Cases
**Path:** `extreme-edge-cases40-v2/index.html`  
**Build:** EE2  
**Result:** **40/40**

Covers:
- €1 deficit / €1 surplus boundaries;
- exact zero;
- exact retirement-age timing;
- one-year-late receipts;
- income start/end boundaries;
- future expenses;
- multiple simultaneous events;
- long horizons;
- recovery from funding gaps;
- purchase boundaries.

Historical note: EE1 scored 35/40 because tests 14–18 themselves were incorrectly constructed. The engine was not changed. The test inputs were corrected in EE2, which then scored 40/40.

### Independent Household Audit
**Path:** `independent-household-audit12/index.html`  
**Build:** IA1  
**Result:** **12/12**

Twelve complete realistic households are compared against a separately written reference calculator. Comparison includes:
- answer;
- conservative end capital;
- base end capital;
- funding gap;
- first gap age.

### Golden Household Suite 20
**Path:** `golden-households20/index.html`  
**Build:** GH1  
**Result:** **20/20**

Hand-verifiable economic truth cases at **0% real return**. No second engine is used as the oracle.

### Golden Household Suite 100
**Path:** `golden-households100/index.html`  
**Build:** GH100  
**Result:** **100/100**, with each of the 10 financial families at **10/10**.

Ten closed-form truth families:
1. exact cash depletion;
2. exact cash shortfall;
3. AOW bridge;
4. certain gift repairing bridge;
5. uncertain gift excluded;
6. AOW + pension exact coverage;
7. annuity/lijfrente;
8. extra future costs;
9. pre-retirement saving;
10. restricted assets excluded from consumption.

### Mutation Test
**Path:** `mutation-test12-v2/index.html`  
**Build:** MT2  
**Result:** **12/12 mutations killed — mutation score 100%**

Intentional economic errors include:
- uncertain gift wrongly consumed;
- restricted assets wrongly consumed;
- gift one year early;
- AOW one year early;
- pension one year early;
- annuity never ending;
- future expense ignored;
- gift counted repeatedly;
- funding gap not repaid first;
- pre-retirement accumulation skipped;
- cash ignored;
- gift one year late.

Historical note: MT1 killed only 8/12. This did **not** indicate four production-engine bugs; it showed four weaknesses in the test oracles. MT2 added state/timing oracles (funding gap, cash depletion, exact injection age) and differentiated early versus late gift timing. MT2 kills all 12.

### Live Geldcheck End-to-End
**Path:** `live-e2e30/index.html`  
**Build:** E2E1 · live UI payload → `GeldcheckEngine.analyze v1.2`  
**Result:** **30/30**

Covers complete live-style routes across:
- health;
- cashflow;
- purchase;
- early/retirement;
- missing required data;
- mortgage logic;
- score boundaries;
- scenarios;
- normalization;
- decision output.

This suite is important because it exercises the same payload shape and live `GeldcheckEngine.analyze()` route used by the current mobile page, rather than only isolated bridge logic.

---

## 3. What the green tests establish

The current evidence is strong that:
- validated accounting identities hold for the covered cases;
- timing boundaries behave correctly for the covered cases;
- uncertain/restricted money is not silently treated as spendable in conservative logic;
- funding-gap mechanics work in the validated cases;
- independent implementation agrees on the audited households;
- closed-form hand-verifiable truths agree across 100 Golden households;
- the test system can detect the 12 deliberate economic mutations;
- the current live-style input → analyze → output route passes its 30 E2E cases.

---

## 4. What is NOT yet proven

Do **not** describe the product as universally financially correct merely because all regression suites are green.

The remaining major validation question is external/content validity:

> Does Geldcheck give financially sensible, understandable and useful advice for messy, realistic households that were NOT designed around the engine or its tests?

This includes real-life combinations and ambiguity that may not fit clean synthetic truth grids.

Potential future domains to expand only when product requirements are defined include, among others:
- inheritance;
- gifts;
- banksparen/lijfrente;
- future sale/proceeds;
- restricted or illiquid assets;
- changing housing costs;
- temporary income;
- future expenses;
- partner/death/divorce-related changes;
- other present or future forms of ownership/wealth.

Do not add a new domain merely because it can be imagined. First define its economic semantics: certainty, liquidity, availability age/date, tax/net amount, duration, restrictions, and whether it may finance the user's goal.

---

## 5. NEXT STEP — resume here

**Do not start by adding more synthetic fuzz or another larger Golden grid.**

Next validation layer:

### Realistic Household Advice Review

Create a set of messy, realistic households **not constructed to fit the engine**. For each household:

1. enter it through the real/live-style Geldcheck route;
2. record the final answer and explanation;
3. independently reason through the household's actual financial situation;
4. judge whether the advice is economically sensible;
5. inspect whether the wording overstates certainty;
6. inspect whether important future money is used at the correct time and with the correct certainty/liquidity treatment;
7. identify missing information that should prevent a hard conclusion;
8. distinguish:
   - calculation bug,
   - data-model gap,
   - advice/policy problem,
   - explanation/UX problem,
   - genuinely ambiguous case.

The purpose is **not** to force every case green. Red cases are valuable if they reveal where Geldcheck's advice model is incomplete.

---

## 6. Regression discipline

After any material change to calculation, Future Layer, Future Bridge, Answer Engine, normalization, or decision logic:

1. rerun the relevant focused test first;
2. rerun the frozen regression suites;
3. do not weaken a test merely to restore green;
4. when a test fails, first determine whether the production logic or the test/oracle is wrong;
5. preserve the old validated version when introducing a materially new bridge/engine version;
6. update this MASTER_STATUS after validation.

Minimum regression gate currently expected:
- AF3: 0 anomalies;
- EE2: 40/40;
- IA1: 12/12;
- GH1: 20/20;
- GH100: 100/100;
- MT2: 12/12 killed;
- E2E1: 30/30.

---

## 7. New-chat handover instruction

In a fresh ChatGPT conversation, use:

> Open my GitHub project `erikiebaan/-geldcheck-mobile`. Read `MASTER_STATUS.md` first, then inspect the current relevant source files and test suites. Treat repository code as source of truth. Continue from the NEXT STEP in MASTER_STATUS. Do not change production code until you understand the validated state and why the existing regression suites are frozen.

---

## 8. Maintenance

Update this document whenever:
- a production calculation rule changes;
- a test suite is superseded;
- a previously green regression fails;
- a bug is confirmed and fixed;
- a new domain becomes part of the supported financial model;
- the NEXT STEP changes.

The goal is that a new conversation can reconstruct the project state from the repository alone.
