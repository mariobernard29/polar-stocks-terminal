import { ask, cancelAi, listAiProviders } from '../../ai'
import type { IpcHandler } from '../register'

/**
 * Polar AI.
 *
 * `ask` recibe la ventana por el contexto del handler porque es a ella a la que
 * hay que emitir los trozos de respuesta conforme llegan.
 */

export const providers: IpcHandler<'ai:providers'> = () => listAiProviders()

export const askQuestion: IpcHandler<'ai:ask'> = (input, context) =>
  ask(context.window, {
    question: input.question,
    history: input.history,
    focusSymbol: input.focusSymbol,
  })

export const cancel: IpcHandler<'ai:cancel'> = () => cancelAi()
