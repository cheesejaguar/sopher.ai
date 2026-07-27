import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWords, qualityTierLabels, sampleBrief } from "@/lib/placeholder-data";

export default function BriefPage() {
  const facts = [
    { label: "Genre", value: sampleBrief.genre },
    { label: "Audience", value: sampleBrief.audience },
    { label: "Tone", value: sampleBrief.tone },
    { label: "Target length", value: `${formatWords(sampleBrief.targetWords)} words` },
    { label: "Quality tier", value: qualityTierLabels[sampleBrief.qualityTier] },
  ];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <h2 className="sr-only">Brief</h2>

      <article className="paper-surface px-6 py-8 sm:px-10 sm:py-10">
        <p className="font-sans text-xs tracking-widest text-paper-muted uppercase">
          The brief, as written
        </p>
        <div className="prose-manuscript mt-6">
          {sampleBrief.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {facts.map((fact) => (
          <Card key={fact.label} size="sm">
            <CardHeader>
              <CardDescription className="text-xs tracking-widest uppercase">
                {fact.label}
              </CardDescription>
              <CardTitle className="text-sm font-medium">{fact.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card size="sm">
          <CardContent className="text-xs text-muted-foreground">
            The brief is the source of truth. Everything the agents write traces back to this page.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
