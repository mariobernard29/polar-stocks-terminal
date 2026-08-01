import { describe, expect, it } from 'vitest'
import { getSessionInfo, marketHolidays, toNyParts } from './session'

/**
 * El estado de sesión es visible en la barra superior en todo momento. Si dice
 * "abierto" un domingo o el día de Acción de Gracias, la herramienta pierde
 * credibilidad entera. Merece pruebas con fechas concretas y conocidas.
 *
 * Las fechas se construyen en UTC y se comprueban contra la hora de Nueva York,
 * que es exactamente el cálculo delicado: en verano hay 4 horas de diferencia y
 * en invierno 5.
 */

const utc = (iso: string): Date => new Date(iso)

describe('toNyParts — conversión a hora de Nueva York', () => {
  it('aplica el horario de verano (EDT, UTC−4)', () => {
    // 1 de julio de 2026, 14:30 UTC → 10:30 en Nueva York.
    const parts = toNyParts(utc('2026-07-01T14:30:00Z'))
    expect(parts.minutes).toBe(10 * 60 + 30)
    expect(parts.day).toBe(1)
  })

  it('aplica el horario de invierno (EST, UTC−5)', () => {
    // 15 de enero de 2026, 14:30 UTC → 09:30 en Nueva York.
    const parts = toNyParts(utc('2026-01-15T14:30:00Z'))
    expect(parts.minutes).toBe(9 * 60 + 30)
  })

  it('no se salta de día en la medianoche de Nueva York', () => {
    // 5:00 UTC del día 2 en invierno = 00:00 del día 2 en Nueva York.
    const parts = toNyParts(utc('2026-01-02T05:00:00Z'))
    expect(parts.minutes).toBe(0)
    expect(parts.day).toBe(2)
  })
})

describe('getSessionInfo — horario regular', () => {
  it('marca abierto a las 10:00 de un miércoles laborable', () => {
    const info = getSessionInfo(utc('2026-07-15T14:00:00Z')) // 10:00 NY
    expect(info.state).toBe('open')
    expect(info.reason).toBeNull()
  })

  it('marca pre-apertura a las 07:00 de Nueva York', () => {
    const info = getSessionInfo(utc('2026-07-15T11:00:00Z')) // 07:00 NY
    expect(info.state).toBe('pre')
  })

  it('marca after-hours a las 17:00 de Nueva York', () => {
    const info = getSessionInfo(utc('2026-07-15T21:00:00Z')) // 17:00 NY
    expect(info.state).toBe('after')
  })

  it('marca cerrado a las 22:00 de Nueva York', () => {
    const info = getSessionInfo(utc('2026-07-16T02:00:00Z')) // 22:00 NY del día 15
    expect(info.state).toBe('closed')
    expect(info.reason).toBe('outsideHours')
  })

  it('abre exactamente a las 9:30, no a las 9:29', () => {
    expect(getSessionInfo(utc('2026-07-15T13:29:00Z')).state).toBe('pre')
    expect(getSessionInfo(utc('2026-07-15T13:30:00Z')).state).toBe('open')
  })

  it('cierra exactamente a las 16:00', () => {
    expect(getSessionInfo(utc('2026-07-15T19:59:00Z')).state).toBe('open')
    expect(getSessionInfo(utc('2026-07-15T20:00:00Z')).state).toBe('after')
  })
})

describe('getSessionInfo — fines de semana y festivos', () => {
  it('cierra los sábados y domingos', () => {
    // 18 de julio de 2026 es sábado; el 19, domingo.
    expect(getSessionInfo(utc('2026-07-18T15:00:00Z')).reason).toBe('weekend')
    expect(getSessionInfo(utc('2026-07-19T15:00:00Z')).reason).toBe('weekend')
  })

  it('cierra el día de Acción de Gracias', () => {
    // Cuarto jueves de noviembre de 2026 = 26 de noviembre.
    const info = getSessionInfo(utc('2026-11-26T15:00:00Z'))
    expect(info.state).toBe('closed')
    expect(info.reason).toBe('holiday')
  })

  it('cierra en Navidad y Año Nuevo', () => {
    expect(getSessionInfo(utc('2026-12-25T15:00:00Z')).reason).toBe('holiday')
    expect(getSessionInfo(utc('2027-01-01T15:00:00Z')).reason).toBe('holiday')
  })

  it('cierra el Viernes Santo, que no es festivo federal', () => {
    // Pascua de 2026: 5 de abril → Viernes Santo el 3 de abril.
    const info = getSessionInfo(utc('2026-04-03T15:00:00Z'))
    expect(info.state).toBe('closed')
    expect(info.reason).toBe('holiday')
  })

  it('traslada al lunes un festivo que cae en domingo', () => {
    // 4 de julio de 2027 es domingo → se observa el lunes 5.
    const holidays = marketHolidays(2027)
    expect(holidays.closed.has('2027-07-05')).toBe(true)
  })

  it('traslada al viernes un festivo que cae en sábado', () => {
    // 25 de diciembre de 2027 es sábado → se observa el viernes 24.
    const holidays = marketHolidays(2027)
    expect(holidays.closed.has('2027-12-24')).toBe(true)
  })

  it('reconoce los principales festivos móviles', () => {
    const holidays = marketHolidays(2026)
    expect(holidays.closed.has('2026-01-19')).toBe(true) // MLK, 3er lunes de enero
    expect(holidays.closed.has('2026-02-16')).toBe(true) // Washington, 3er lunes de febrero
    expect(holidays.closed.has('2026-05-25')).toBe(true) // Memorial, último lunes de mayo
    expect(holidays.closed.has('2026-09-07')).toBe(true) // Trabajo, 1er lunes de septiembre
  })
})

describe('getSessionInfo — cierres anticipados', () => {
  it('cierra a las 13:00 el viernes siguiente a Acción de Gracias', () => {
    // 27 de noviembre de 2026.
    const before = getSessionInfo(utc('2026-11-27T17:30:00Z')) // 12:30 NY
    const after = getSessionInfo(utc('2026-11-27T18:30:00Z')) // 13:30 NY

    expect(before.state).toBe('open')
    expect(before.earlyClose).toBe(true)
    expect(after.state).toBe('after')
  })

  it('marca Nochebuena como media sesión', () => {
    expect(marketHolidays(2026).earlyClose.has('2026-12-24')).toBe(true)
  })
})

describe('getSessionInfo — activos que no cierran', () => {
  it('cripto y forex están siempre abiertos, incluso en festivo', () => {
    const navidad = utc('2026-12-25T15:00:00Z')
    expect(getSessionInfo(navidad, 'crypto').state).toBe('open')
    expect(getSessionInfo(navidad, 'forex').state).toBe('open')
    expect(getSessionInfo(navidad, 'stock').state).toBe('closed')
  })
})
