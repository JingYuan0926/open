import * as React from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Icon } from "@/components/ui/Icon";

export function AgentBuilderForm() {
  const [name, setName] = React.useState("Migration Specialist");
  const [skill, setSkill] = React.useState("Database migrations");
  const [desc, setDesc] = React.useState("Plans and previews schema migrations with reversible defaults. Will not apply destructive changes without an approval card.");
  const [price, setPrice] = React.useState("0.16");
  const [runtime, setRuntime] = React.useState("Node 20 · isolated VM");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";

  return (
    <Card>
      <CardHeader icon={<Icon name="plus" size={14} />}>
        <div className="flex items-center gap-2.5">
          <span className="flex-1">Publish a new specialist</span>
          <Badge variant="info">Draft</Badge>
        </div>
      </CardHeader>
      <div className="p-4 grid grid-cols-[1.4fr_1fr] gap-4 max-[1080px]:grid-cols-1">
        <div className="grid gap-3.5">
          <Field label="Agent name" hint="Shown to users when this specialist is summoned.">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Skill category">
              <Input value={skill} onChange={(e) => setSkill(e.target.value)} />
            </Field>
            <Field label="Price per call">
              <div className="flex items-center gap-1.5">
                <span className="text-ink-3 text-[13px]">$</span>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            </Field>
          </div>
          <Field label="Persona / description" hint="How the agent introduces itself to the coordinator.">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} />
          </Field>
          <Field label="Runtime"><Input value={runtime} onChange={(e) => setRuntime(e.target.value)} /></Field>
        </div>

        <div className="grid gap-3 content-start">
          <div className="text-[12.5px] font-medium text-ink-2">Identity preview</div>
          <Disclosure title="ENS subname" icon="globe" defaultOpen right={<Badge variant="info" mono>resolves</Badge>}>
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">// Specialists are discoverable via ENS</div>
              {slug}.righthand.eth
            </div>
          </Disclosure>
          <Disclosure title="0G Storage URI" icon="database" defaultOpen>
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">// Encrypted memory + task logs</div>
              0g://ws/agents/{slug}/v1
            </div>
          </Disclosure>
          <Disclosure title="AXL public key" icon="key">
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">// Used for inter-agent traffic auth</div>
              axl1{slug.slice(0,3)}n2…{slug.slice(0,2)}9pq3v
            </div>
          </Disclosure>
          <Disclosure title="iNFT identity" icon="cube">
            <div className="bg-surface-2 border border-dashed border-border-strong rounded-md p-3 font-mono text-[12px] text-ink-2 break-all">
              <div className="text-ink-4">// Ownership, memory pointer, payment rules</div>
              iNFT #4831 · owner: you.eth
            </div>
          </Disclosure>

          <div className="flex gap-2 mt-1">
            <Button variant="primary" icon="arrow-up-right">Publish Specialist</Button>
            <Button variant="secondary" icon="play">Preview</Button>
          </div>
          <div className="text-[11.5px] text-ink-3">Publishing mints an iNFT and registers the ENS subname. You can pause or update at any time.</div>
        </div>
      </div>
    </Card>
  );
}
