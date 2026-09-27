import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useMatch } from 'react-router-dom';
import { useSession } from '../session/session-provider.js';
import { createContractorCommandTransport, type ContractorCommandTransport } from './command-transport.js';

const CommandContext = createContext<ContractorCommandTransport | null>(null);

/** Lives above the revision-keyed Outlet so a session refetch cannot discard uncertain intents. */
export function ContractorCommandProvider({ children }: { readonly children: ReactNode }) {
  const { status, session, authorizedFetch } = useSession();
  const route = useMatch('/contractor/cases/:caseId');
  // Revision and display names affect reads/UI, but do not change mutation ownership.
  const scope = JSON.stringify([status, session?.effective_actor.app_user_id,
    session?.effective_actor.role, session?.demo_run_id, route?.params.caseId]);
  const commands = useMemo(() => createContractorCommandTransport(authorizedFetch, scope),
    [authorizedFetch, scope]);
  return <CommandContext.Provider value={commands}>{children}</CommandContext.Provider>;
}

export function useContractorCommands(): ContractorCommandTransport {
  const commands = useContext(CommandContext);
  if (!commands) throw new Error('ContractorCommandProvider missing');
  return commands;
}
