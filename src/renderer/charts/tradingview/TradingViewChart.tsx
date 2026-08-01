import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toTradingViewInterval, toTradingViewSymbol } from '@shared/market/tradingview-symbols'
import type { ChartProps } from '../types'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Gráfico de TradingView
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Se embebe con un **iframe directo**, no con el script de incrustación
 * habitual. Es una decisión de seguridad deliberada:
 *
 * El método que documenta TradingView inyecta un `<script>` suyo en la página,
 * que se ejecuta con **nuestro origen** y nuestros privilegios. En una
 * aplicación que además guarda claves de API, dar ejecución a código de terceros
 * dentro del renderer es un riesgo que no compensa por comodidad.
 *
 * Con el iframe, su código corre aislado en el origen de TradingView y la
 * política de seguridad solo necesita permitir `frame-src` para ese dominio —
 * nada de `script-src`. El `sandbox` restringe además lo que ese marco puede
 * hacer.
 *
 * A cambio se pierde la API de JavaScript del widget (no se le puede pedir
 * indicadores por código). Los controles que ofrece su propia barra siguen
 * funcionando, y el motor completo llega con Advanced Charts.
 */
export function TradingViewChart({ symbol, timeframe, exchange }: ChartProps): React.JSX.Element {
  const { i18n } = useTranslation()

  const src = useMemo(() => {
    const url = new URL('https://s.tradingview.com/widgetembed/')

    url.searchParams.set('symbol', toTradingViewSymbol(symbol, exchange))
    url.searchParams.set('interval', toTradingViewInterval(timeframe))
    url.searchParams.set('theme', 'dark')
    url.searchParams.set('style', '1') // velas japonesas
    url.searchParams.set('timezone', 'America/New_York')
    url.searchParams.set('locale', i18n.language === 'es' ? 'es' : 'en')
    url.searchParams.set('hide_side_toolbar', '0')
    url.searchParams.set('allow_symbol_change', '0')
    url.searchParams.set('save_image', '0')
    // Fondo a juego con nuestro tema para que no aparezca un rectángulo claro
    // mientras el widget carga.
    url.searchParams.set('backgroundColor', '#08090A')
    url.searchParams.set('gridColor', '#24282D')

    return url.toString()
  }, [symbol, timeframe, exchange, i18n.language])

  return (
    <iframe
      // La `key` fuerza a recrear el marco al cambiar de símbolo o intervalo:
      // el widget no reacciona a cambios de `src` una vez inicializado.
      key={src}
      src={src}
      title={`TradingView · ${symbol}`}
      className="size-full border-0"
      // Se concede lo mínimo para que el widget funcione. Sin `allow-same-origin`
      // el gráfico no carga (necesita su propio almacenamiento), pero al estar
      // en otro origen eso no le da acceso al nuestro.
      sandbox="allow-scripts allow-same-origin allow-popups"
      referrerPolicy="origin"
      loading="lazy"
    />
  )
}
