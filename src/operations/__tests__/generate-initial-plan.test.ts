import { describe, expect, it } from 'vitest';
import { ConfrontAdapter } from '../../drill/confrontation/confront-adapter';
import { generateInitialPlanForSession } from '../generate-initial-plan';
import { __resetOperationSessionForTest, startOperationSession } from '../operation-session';

function stream(event: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n`));
      controller.close();
    },
  });
}

describe('generateInitialPlanForSession', () => {
  it('复用 Planner 的 preflight 输出并保留会话/证据', async () => {
    __resetOperationSessionForTest();
    const session = startOperationSession('drill', {
      buildingId: 'b-21', buildingName: '21号楼', floor: '5F', material: '电气', trapped: 5,
    });
    let requestAppId = '';
    const adapter = new ConfrontAdapter({
      postChat: async (request) => {
        requestAppId = request.app_id;
        return stream({
          type: 'tool-call', toolName: 'propose_initial_plan', args: {
            plan: {
              response_level: 'Ⅱ级响应', forces: ['康泰路专职队'], tactics: ['内攻控火'],
              key_points: ['先搜救'], attack_route: ['1F', '5F'], evacuation_route: ['5F', '13F'],
              safety_controls: ['空呼监测'], evidence: [{ kind: 'plan', label: '21号楼正式预案V1' }], warnings: [],
            },
          },
        });
      },
    });
    const proposal = await generateInitialPlanForSession({ session, appId: 'planner-app', adapter });
    expect(requestAppId).toBe('planner-app');
    expect(proposal).toMatchObject({
      source: 'agent', responseLevel: 'Ⅱ级响应', routes: { attack: ['1F', '5F'] },
      evidence: [{ kind: 'plan', label: '21号楼正式预案V1' }],
    });
  });
});
