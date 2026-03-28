import { AgentCapabilities } from '../../types/agent';
import { ExecutionBehavior } from '../../types/execution';

export function getSupportedExecutionBehaviors(capabilities: AgentCapabilities): ExecutionBehavior[] {
  const behaviors: ExecutionBehavior[] = [];
  if (capabilities.canAutoSubmit) behaviors.push('send');
  if (capabilities.canAppendInput) behaviors.push('append');
  if (capabilities.canFillInput) behaviors.push('overwrite');
  if (capabilities.canInsertInput) behaviors.push('insert');
  return behaviors;
}
