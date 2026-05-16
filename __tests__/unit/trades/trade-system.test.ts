// ── Trade System Tests ──────────────────────────────────────────────────────
// Run: npx jest __tests__/unit/trades/
// These tests guarantee: isolation, no cross-contamination, unknown slug safety,
// state machine correctness, future trade compatibility.

import { getTradeConfig, isRoofing, isHVAC, isPlumbing, isElectrician, isGC, isDefault, getActiveStages, getTerminalStages, getInitialStage } from '../../../lib/trades/_registry'
import { isValidRoofingTransition, isRoofingBackwardMove, getRoofingAutoTriggers, ROOFING_STAGES } from '../../../lib/trades/roofing/state-machine'
import { isValidHVACTransition, isHVACBackwardMove, getHVACAutoTriggers, HVAC_STAGES } from '../../../lib/trades/hvac/state-machine'
import { isValidPlumbingTransition } from '../../../lib/trades/plumbing/state-machine'
import { isValidElectricianTransition } from '../../../lib/trades/electrician/state-machine'
import { isValidGCTransition } from '../../../lib/trades/general-contractor/state-machine'

// ── Registry tests ────────────────────────────────────────────────────────────
describe('Trade Registry', () => {

  describe('Slug resolution', () => {
    test.each([
      ['roofing',            'roofing'],
      ['roofing-contractor', 'roofing'],
      ['roofer',             'roofing'],
      ['hvac-technician',    'hvac-technician'],
      ['plumber',            'plumber'],
      ['electrician',        'electrician'],
      ['general-contractor', 'general-contractor'],
    ])('slug "%s" resolves to config slug "%s"', (input, expected) => {
      expect(getTradeConfig(input).slug).toBe(expected)
    })

    test('unknown slug returns default, never throws', () => {
      expect(() => getTradeConfig('welding-robot-xyz')).not.toThrow()
      expect(getTradeConfig('welding-robot-xyz').slug).toBe('_default')
    })

    test('null slug returns default', () => {
      expect(getTradeConfig(null).slug).toBe('_default')
    })

    test('undefined slug returns default', () => {
      expect(getTradeConfig(undefined).slug).toBe('_default')
    })

    test('empty string returns default', () => {
      expect(getTradeConfig('').slug).toBe('_default')
    })
  })

  describe('Type guards', () => {
    test('isRoofing() true for roofing slugs only', () => {
      expect(isRoofing(getTradeConfig('roofing'))).toBe(true)
      expect(isRoofing(getTradeConfig('hvac-technician'))).toBe(false)
      expect(isRoofing(getTradeConfig('plumber'))).toBe(false)
      expect(isRoofing(getTradeConfig('electrician'))).toBe(false)
      expect(isRoofing(getTradeConfig('general-contractor'))).toBe(false)
    })

    test('isHVAC() true for hvac slug only', () => {
      expect(isHVAC(getTradeConfig('hvac-technician'))).toBe(true)
      expect(isHVAC(getTradeConfig('roofing'))).toBe(false)
      expect(isHVAC(getTradeConfig('plumber'))).toBe(false)
    })

    test('isDefault() true for unknown trades', () => {
      expect(isDefault(getTradeConfig('painter'))).toBe(true)
      expect(isDefault(getTradeConfig('mason'))).toBe(true)
      expect(isDefault(getTradeConfig('landscaper'))).toBe(true)
      expect(isDefault(getTradeConfig('roofing'))).toBe(false)
    })
  })
})

// ── Feature isolation tests ───────────────────────────────────────────────────
describe('Trade Feature Isolation', () => {

  test('roofing has no HVAC properties', () => {
    const c = getTradeConfig('roofing')
    expect('equipmentRecords'  in c.features).toBe(false)
    expect('refrigerantLog'    in c.features).toBe(false)
    expect('maintenancePlans'  in c.features).toBe(false)
    expect('epaCertTracking'   in c.features).toBe(false)
  })

  test('roofing has no plumbing properties', () => {
    const c = getTradeConfig('roofing')
    expect('fixtureRecords'    in c.features).toBe(false)
    expect('emergencyDispatch' in c.features).toBe(false)
  })

  test('roofing has no electrician properties', () => {
    const c = getTradeConfig('roofing')
    expect('panelRecords'   in c.features).toBe(false)
    expect('codeCompliance' in c.features).toBe(false)
  })

  test('HVAC has no roofing properties', () => {
    const c = getTradeConfig('hvac-technician')
    expect('insuranceClaim'    in c.features).toBe(false)
    expect('satelliteMeasure'  in c.features).toBe(false)
    expect('goodBetterBest'    in c.features).toBe(false)
    expect('adjusterPhotoZip'  in c.features).toBe(false)
    expect('lienWaivers'       in c.features).toBe(false)
  })

  test('HVAC has no electrician properties', () => {
    const c = getTradeConfig('hvac-technician')
    expect('panelRecords'   in c.features).toBe(false)
    expect('loadCalculator' in c.features).toBe(false)
  })

  test('electrician has no HVAC properties', () => {
    const c = getTradeConfig('electrician')
    expect('equipmentRecords' in c.features).toBe(false)
    expect('refrigerantLog'   in c.features).toBe(false)
  })

  test('plumbing has no roofing properties', () => {
    const c = getTradeConfig('plumber')
    expect('insuranceClaim'   in c.features).toBe(false)
    expect('satelliteMeasure' in c.features).toBe(false)
    expect('warrantyRecord'   in c.features).toBe(false)
  })
})

// ── Nav isolation tests ───────────────────────────────────────────────────────
describe('Nav Section Isolation', () => {

  test('no nav URL appears in two different trades', () => {
    const trades = ['roofing', 'hvac-technician', 'plumber', 'electrician', 'general-contractor']
    const allHrefs: Array<{ href: string; trade: string }> = []

    trades.forEach(slug => {
      const c = getTradeConfig(slug)
      c.nav.forEach(section => {
        section.items.forEach(item => {
          // Shared routes (jobs, calendar, clients, invoices, performance) are allowed
          // Trade-specific tool routes must be unique
          if (!item.href.startsWith('/dashboard/jobs') &&
              !item.href.startsWith('/dashboard/calendar') &&
              !item.href.startsWith('/dashboard/clients') &&
              !item.href.startsWith('/dashboard/invoices') &&
              !item.href.startsWith('/dashboard/performance') &&
              !item.href.startsWith('/dashboard/estimates')) {
            allHrefs.push({ href: item.href, trade: slug })
          }
        })
      })
    })

    // Check no two trades share a trade-specific tool URL
    const hrefMap: Record<string, string> = {}
    allHrefs.forEach(({ href, trade }) => {
      if (hrefMap[href]) {
        throw new Error(`URL "${href}" appears in both "${hrefMap[href]}" and "${trade}"`)
      }
      hrefMap[href] = trade
    })
    // If we get here, no duplicates
    expect(Object.keys(hrefMap).length).toBeGreaterThan(0)
  })

  test('every trade config has a JOBS nav section', () => {
    ['roofing', 'hvac-technician', 'plumber', 'electrician', 'general-contractor'].forEach(slug => {
      const c = getTradeConfig(slug)
      const jobsSection = c.nav.find(s => s.title === 'JOBS')
      expect(jobsSection).toBeDefined()
    })
  })

  test('HVAC nav has MY EQUIPMENT section, roofing does not', () => {
    const hvac    = getTradeConfig('hvac-technician')
    const roofing = getTradeConfig('roofing')
    expect(hvac.nav.some(s    => s.title === 'MY EQUIPMENT')).toBe(true)
    expect(roofing.nav.some(s => s.title === 'MY EQUIPMENT')).toBe(false)
  })

  test('roofing nav has ROOFING TOOLS section, HVAC does not', () => {
    const roofing = getTradeConfig('roofing')
    const hvac    = getTradeConfig('hvac-technician')
    expect(roofing.nav.some(s => s.title === 'ROOFING TOOLS')).toBe(true)
    expect(hvac.nav.some(s    => s.title === 'ROOFING TOOLS')).toBe(false)
  })
})

// ── Stage integrity tests ─────────────────────────────────────────────────────
describe('Stage Integrity', () => {

  test('every trade has at least 5 stages', () => {
    ['roofing', 'hvac-technician', 'plumber', 'electrician', 'general-contractor'].forEach(slug => {
      expect(getTradeConfig(slug).stages.length).toBeGreaterThanOrEqual(5)
    })
  })

  test('every trade has exactly 2 terminal stages (lost + unqualified)', () => {
    ['roofing', 'hvac-technician', 'plumber', 'electrician', 'general-contractor'].forEach(slug => {
      const terminals = getTerminalStages(slug)
      expect(terminals.length).toBe(2)
    })
  })

  test('lost stage is reopenable, unqualified is not', () => {
    ['roofing', 'hvac-technician', 'plumber', 'electrician'].forEach(slug => {
      const terminals = getTerminalStages(slug)
      const lost = terminals.find(s => s.key === 'lost')
      const unqualified = terminals.find(s => s.key === 'unqualified')
      expect(lost?.reopenable).toBe(true)
      expect(unqualified?.reopenable).toBe(false)
    })
  })

  test('every stage has an icon (not empty string)', () => {
    ['roofing', 'hvac-technician', 'plumber', 'electrician'].forEach(slug => {
      getTradeConfig(slug).stages.forEach(stage => {
        expect(stage.icon.length).toBeGreaterThan(0)
      })
    })
  })

  test('getInitialStage returns non-terminal stage', () => {
    ['roofing', 'hvac-technician', 'plumber', 'electrician', 'general-contractor'].forEach(slug => {
      const initial = getInitialStage(slug)
      const config = getTradeConfig(slug)
      const stage = config.stages.find(s => s.key === initial)
      expect(stage?.terminal).toBeFalsy()
    })
  })
})

// ── Roofing state machine tests ───────────────────────────────────────────────
describe('Roofing State Machine', () => {

  describe('Forward transitions', () => {
    test.each([
      ['lead_in',              'inspection_scheduled'],
      ['inspection_scheduled', 'proposal_sent'],
      ['proposal_sent',        'proposal_signed'],
      ['proposal_signed',      'insurance_approved'],
      ['insurance_approved',   'scheduled'],
      ['scheduled',            'in_progress'],
      ['in_progress',          'job_won'],
    ] as const)('%s → %s is valid', (from, to) => {
      expect(isValidRoofingTransition(from, to)).toBe(true)
    })
  })

  describe('Backward transitions (deliberate moves)', () => {
    test.each([
      ['proposal_sent',  'lead_in'],
      ['proposal_signed','proposal_sent'],
      ['in_progress',    'scheduled'],
    ] as const)('%s → %s is allowed (backward)', (from, to) => {
      expect(isValidRoofingTransition(from, to)).toBe(true)
      expect(isRoofingBackwardMove(from, to)).toBe(true)
    })
  })

  describe('Skip transitions', () => {
    test('lead_in → proposal_sent (referral, no inspection)', () => {
      expect(isValidRoofingTransition('lead_in', 'proposal_sent')).toBe(true)
    })
    test('proposal_signed → scheduled (retail, skip insurance)', () => {
      expect(isValidRoofingTransition('proposal_signed', 'scheduled')).toBe(true)
    })
  })

  describe('Terminal transitions', () => {
    test('every active stage can go to lost', () => {
      // All active stages (not lost itself, not unqualified) can transition to lost
      const activeStages = ROOFING_STAGES.filter(s => s !== 'unqualified' && s !== 'lost')
      activeStages.forEach(stage => {
        expect(isValidRoofingTransition(stage, 'lost')).toBe(true)
      })
    })
    test('unqualified has no valid exits', () => {
      ROOFING_STAGES.forEach(stage => {
        expect(isValidRoofingTransition('unqualified', stage)).toBe(false)
      })
    })
    test('lost reopens to lead_in only', () => {
      expect(isValidRoofingTransition('lost', 'lead_in')).toBe(true)
      expect(isValidRoofingTransition('lost', 'proposal_sent')).toBe(false)
    })
  })

  describe('Invalid transitions', () => {
    test('same → same is always invalid', () => {
      ROOFING_STAGES.forEach(stage => {
        expect(isValidRoofingTransition(stage, stage)).toBe(false)
      })
    })
    test('lead_in → job_won (skip everything) is blocked', () => {
      expect(isValidRoofingTransition('lead_in', 'job_won')).toBe(false)
    })
    test('job_won → lead_in is blocked (wrong re-open path)', () => {
      expect(isValidRoofingTransition('job_won', 'lead_in')).toBe(false)
    })
  })

  describe('Auto-triggers', () => {
    test('proposal_signed fires deposit + email', () => {
      const triggers = getRoofingAutoTriggers('proposal_signed')
      expect(triggers).toContain('stripe_deposit')
      expect(triggers).toContain('send_proposal_signed_email')
    })
    test('job_won fires warranty + review + summary', () => {
      const triggers = getRoofingAutoTriggers('job_won')
      expect(triggers).toContain('create_warranty_record')
      expect(triggers).toContain('queue_review_request')
      expect(triggers).toContain('generate_job_summary')
    })
    test('lead_in fires no triggers', () => {
      expect(getRoofingAutoTriggers('lead_in')).toHaveLength(0)
    })
  })
})

// ── HVAC state machine tests ──────────────────────────────────────────────────
describe('HVAC State Machine', () => {

  test('new_call → diagnosed → quoted → scheduled → in_progress → job_won', () => {
    const path: Array<[string, string]> = [
      ['new_call', 'diagnosed'], ['diagnosed', 'quoted'],
      ['quoted', 'scheduled'], ['scheduled', 'in_progress'], ['in_progress', 'job_won'],
    ]
    path.forEach(([from, to]) => {
      expect(isValidHVACTransition(from as any, to as any)).toBe(true)
    })
  })

  test('HVAC unqualified has no exits', () => {
    HVAC_STAGES.forEach(stage => {
      expect(isValidHVACTransition('unqualified', stage)).toBe(false)
    })
  })

  test('job_won triggers maintenance reminder + review', () => {
    const triggers = getHVACAutoTriggers('job_won')
    expect(triggers).toContain('create_maintenance_reminder')
    expect(triggers).toContain('queue_review_request')
  })
})

// ── Cross-trade isolation tests ───────────────────────────────────────────────
describe('Cross-Trade State Machine Isolation', () => {

  test('roofing stage keys do not appear in HVAC stages', () => {
    const roofingKeys = new Set(ROOFING_STAGES)
    const hvacKeys    = new Set(HVAC_STAGES)
    // inspection_scheduled is roofing-specific
    expect(hvacKeys.has('inspection_scheduled' as any)).toBe(false)
    // proposal_signed is roofing-specific
    expect(hvacKeys.has('proposal_signed' as any)).toBe(false)
    // insurance_approved is roofing-specific
    expect(hvacKeys.has('insurance_approved' as any)).toBe(false)
    // new_call is HVAC-specific
    expect(roofingKeys.has('new_call' as any)).toBe(false)
    // diagnosed is HVAC-specific
    expect(roofingKeys.has('diagnosed' as any)).toBe(false)
  })

  test('plumbing transition function only accepts plumbing stages', () => {
    // Roofing stage key passed to plumbing → false (not in plumbing transitions)
    expect(isValidPlumbingTransition('inspection_scheduled' as any, 'proposal_sent' as any)).toBe(false)
    expect(isValidPlumbingTransition('insurance_approved' as any, 'scheduled' as any)).toBe(false)
  })

  test('electrician has permit stages that no other trade has', () => {
    expect(isValidElectricianTransition('permit_submitted', 'permit_approved')).toBe(true)
    expect(isValidRoofingTransition('permit_submitted' as any, 'permit_approved' as any)).toBe(false)
    expect(isValidHVACTransition('permit_submitted' as any, 'permit_approved' as any)).toBe(false)
  })

  test('GC has bidding stage that no other trade has', () => {
    expect(isValidGCTransition('lead_in', 'bidding')).toBe(true)
    expect(isValidRoofingTransition('lead_in', 'bidding' as any)).toBe(false)
    expect(isValidHVACTransition('new_call', 'bidding' as any)).toBe(false)
  })
})
