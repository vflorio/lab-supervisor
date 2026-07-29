import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Settings router - espone la configurazione di servizio (già redatta lato service, vedi
// `ConfigModel.redact`) per la pagina Settings in sola lettura.
// -------------------------------------------------------------------------------------

export const settingsRouter = router({
  getConfig: publicProcedure.query(({ ctx }) => ctx.services.settings.getConfig()),
});
