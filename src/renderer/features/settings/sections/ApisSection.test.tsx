// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderSummary } from '@shared/ipc/contract'
import { initI18n } from '../../../i18n'
import { ProviderCard } from './ApisSection'

/**
 * La tarjeta de proveedor es la interfaz por la que entra una API key. El
 * proveedor simulado no requiere clave, así que este camino no se puede
 * ejercitar en la aplicación hasta la Fase 2 — y precisamente por eso conviene
 * cubrirlo con pruebas ahora, en vez de descubrir que estaba roto el día que se
 * conecte el primer proveedor real.
 */

await initI18n('es')

function makeProvider(overrides: Partial<ProviderSummary> = {}): ProviderSummary {
  return {
    id: 'ejemplo',
    displayName: 'Proveedor de ejemplo',
    requiresApiKey: true,
    docsUrl: null,
    hasSecret: false,
    masked: null,
    enabled: true,
    priority: 100,
    lastCheckedAt: null,
    lastCheckOk: null,
    lastCheckNote: null,
    capabilities: ['quote', 'news'],
    ...overrides,
  }
}

const noop = (): void => undefined

// Sin `globals: true` en vitest, Testing Library no limpia sola entre pruebas y
// los renders se acumulan en el mismo documento.
afterEach(cleanup)

describe('ProviderCard', () => {
  it('muestra el campo de clave cuando el proveedor la requiere', () => {
    render(
      <ProviderCard
        provider={makeProvider()}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    expect(screen.getByPlaceholderText(/clave de API/i)).toBeDefined()
    expect(screen.getByText(/Sin clave configurada/i)).toBeDefined()
  })

  it('no muestra campo de clave cuando el proveedor no la necesita', () => {
    render(
      <ProviderCard
        provider={makeProvider({ requiresApiKey: false })}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    expect(screen.queryByPlaceholderText(/clave de API/i)).toBeNull()
    expect(screen.getByText(/No requiere clave/i)).toBeDefined()
  })

  /**
   * El campo es `type="password"` y sin autocompletado. No es cosmética: evita
   * que la clave quede a la vista de quien pase por detrás y que el navegador
   * la guarde en su propio almacén, fuera del cifrado del sistema.
   */
  it('oculta la clave mientras se escribe y no la ofrece al autocompletado', () => {
    render(
      <ProviderCard
        provider={makeProvider()}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    const input = screen.getByPlaceholderText(/clave de API/i)
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
  })

  it('no deja guardar una clave vacía', () => {
    const onSaveKey = vi.fn()
    render(
      <ProviderCard
        provider={makeProvider()}
        onSaveKey={onSaveKey}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(save.hasAttribute('disabled')).toBe(true)
  })

  it('entrega la clave y limpia el campo inmediatamente', () => {
    const onSaveKey = vi.fn()
    render(
      <ProviderCard
        provider={makeProvider()}
        onSaveKey={onSaveKey}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    const input = screen.getByPlaceholderText(/clave de API/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '  sk-clave-secreta  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    // Se recorta el espacio sobrante: pegar una clave suele arrastrarlo.
    expect(onSaveKey).toHaveBeenCalledWith('sk-clave-secreta')
    // Y no sigue en memoria del renderer una vez entregada al main.
    expect(input.value).toBe('')
  })

  it('muestra la máscara, nunca la clave, cuando ya hay una guardada', () => {
    render(
      <ProviderCard
        provider={makeProvider({ hasSecret: true, masked: '••••••••1234' })}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    expect(screen.getByText('••••••••1234')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDefined()
  })

  it('solo ofrece eliminar cuando hay algo que eliminar', () => {
    render(
      <ProviderCard
        provider={makeProvider({ hasSecret: false })}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
  })

  it('permite activar y desactivar el proveedor sin tocar su clave', () => {
    const onToggle = vi.fn()
    render(
      <ProviderCard
        provider={makeProvider({ enabled: true })}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={onToggle}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('lista las capacidades que el proveedor aporta', () => {
    render(
      <ProviderCard
        provider={makeProvider({ capabilities: ['quote', 'news', 'historical'] })}
        onSaveKey={noop}
        onRemoveKey={noop}
        onToggle={noop}
        onPriority={noop}
        onTest={noop}
        testing={false}
        testResult={null}
      />,
    )

    expect(screen.getByText('quote')).toBeDefined()
    expect(screen.getByText('news')).toBeDefined()
    expect(screen.getByText('historical')).toBeDefined()
  })
})
