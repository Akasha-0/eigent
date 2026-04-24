# Animation Libraries Consolidation Guide

## Overview

This document outlines the plan to consolidate animation libraries in Eigent, reducing bundle size and simplifying maintenance.

## Current State

Eigent currently uses 4 animation libraries:

| Library | Size (gzip) | Use Case |
|---------|------------|----------|
| `gsap` | ~60KB | Complex timelines, scroll triggers |
| `framer-motion` | ~30KB | React components, gestures |
| `motion` | ~15KB | Lightweight animations |
| `@gsap/react` | ~2KB | GSAP React integration |
| `lottie-web` | ~50KB | JSON vector animations |
| `postprocessing` | ~80KB | Three.js effects |

**Total Animation Bundle: ~237KB+ (gzipped)**

## Recommended Consolidation

### Keep: Framer Motion

**Rationale:**
- Most popular React animation library
- Excellent React integration
- Good performance
- Active maintenance
- Rich gesture support

### Remove: GSAP, Motion

**Rationale:**
- Overlapping functionality with Framer Motion
- Increases bundle size significantly
- Two different animation APIs to maintain

### Keep: Lottie

**Rationale:**
- Unique capability (JSON animations)
- No direct replacement

### Keep: Postprocessing

**Rationale:**
- Three.js specific effects
- No replacement available

## Migration Strategy

### Phase 1: Audit (TODO)

Identify all GSAP and Motion usages:

```bash
# Find GSAP imports
grep -r "from 'gsap'" src/ --include="*.ts" --include="*.tsx"
grep -r "from 'motion'" src/ --include="*.ts" --include="*.tsx"
grep -r "gsap\." src/ --include="*.ts" --include="*.tsx"
grep -r "motion(" src/ --include="*.ts" --include="*.tsx"
```

### Phase 2: Create Replacements (TODO)

Create Framer Motion equivalents for common GSAP patterns:

| GSAP | Framer Motion |
|------|---------------|
| `gsap.to(el, {x: 100})` | `<motion.div animate={{x: 100}}>` |
| `gsap.timeline()` | `<motion.div>` with variants |
| `gsap.from(el, {opacity: 0})` | `<motion.div initial={{opacity: 0}}>` |
| `useGSAP` hook | `useAnimation` hook |

### Phase 3: Replace (TODO)

Replace animations one component at a time:

1. Start with simple animations
2. Test thoroughly
3. Progress to complex timelines

### Phase 4: Remove (TODO)

Once all GSAP/Motion usage is migrated:

```bash
# Remove from package.json
pnpm remove gsap @gsap/react motion

# Remove imports
```

## Bundle Savings

| Scenario | Estimated Savings |
|----------|------------------|
| Remove GSAP + Motion | ~75KB gzipped |
| After optimization | Potential 30-50% reduction |

## Priority

**Low-Medium** — Only undertake if:
- Bundle size becomes critical
- Development velocity is impacted
- Resources available for thorough testing

## Alternative: Conditional Loading

If full removal is risky, consider:

```typescript
// Lazy load heavy animations only when needed
const HeavyAnimation = lazy(() => import('./HeavyAnimation'));
```

---

*Last updated: 2026-04-24*