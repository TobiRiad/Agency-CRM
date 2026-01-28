"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getClientPB,
  getCampaign,
  getContacts,
  getFunnelStages,
  getContactStages,
  setContactStage,
  getBatches,
} from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  GripVertical,
  Mail,
  Building,
  Layers,
} from "lucide-react";
import type { Campaign, Contact, FunnelStage, ContactStage, Batch } from "@/types";
import { getStageColor } from "@/lib/utils";

interface ContactCardProps {
  contact: Contact;
  isDragging?: boolean;
}

function ContactCard({ contact, isDragging }: ContactCardProps) {
  return (
    <div
      className={`p-3 bg-white dark:bg-slate-800 rounded-lg border shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {contact.first_name} {contact.last_name}
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Mail className="h-3 w-3" />
            <span className="truncate">{contact.email}</span>
          </div>
          {contact.expand?.company?.name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Building className="h-3 w-3" />
              <span className="truncate">{contact.expand.company.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SortableContactProps {
  contact: Contact;
}

function SortableContact({ contact }: SortableContactProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: contact.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ContactCard contact={contact} isDragging={isDragging} />
    </div>
  );
}

interface UnassignedColumnProps {
  contacts: Contact[];
}

function UnassignedColumn({ contacts }: UnassignedColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
  });

  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      <div className="rounded-t-lg px-4 py-2 bg-slate-400 dark:bg-slate-600">
        <div className="flex items-center justify-between text-white">
          <h3 className="font-semibold">Unassigned</h3>
          <Badge variant="secondary" className="bg-white/20 text-white">
            {contacts.length}
          </Badge>
        </div>
      </div>
      <div 
        ref={setNodeRef}
        className={`bg-slate-100 dark:bg-slate-900 rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors ${
          isOver ? 'ring-2 ring-primary ring-inset bg-primary/5' : ''
        }`}
      >
        <SortableContext
          items={contacts.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {contacts.map((contact) => (
            <SortableContact key={contact.id} contact={contact} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

interface StageColumnProps {
  stage: FunnelStage;
  contacts: Contact[];
  index: number;
}

function StageColumn({ stage, contacts, index }: StageColumnProps) {
  const color = stage.color || getStageColor(index);
  
  // Make the entire column a droppable area
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      <div
        className="rounded-t-lg px-4 py-2"
        style={{ backgroundColor: color }}
      >
        <div className="flex items-center justify-between text-white">
          <h3 className="font-semibold">{stage.name}</h3>
          <Badge variant="secondary" className="bg-white/20 text-white">
            {contacts.length}
          </Badge>
        </div>
      </div>
      <div 
        ref={setNodeRef}
        className={`bg-slate-100 dark:bg-slate-900 rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors ${
          isOver ? 'ring-2 ring-primary ring-inset bg-primary/5' : ''
        }`}
      >
        <SortableContext
          items={contacts.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {contacts.map((contact) => (
            <SortableContact key={contact.id} contact={contact} />
          ))}
        </SortableContext>
        {contacts.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Drop contacts here
          </div>
        )}
      </div>
    </div>
  );
}

export default function FunnelPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [contactStageMap, setContactStageMap] = useState<Map<string, string>>(new Map());
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadData = useCallback(async () => {
    try {
      const pb = getClientPB();
      const [campaignData, contactsData, stagesData, contactStagesData, batchesData] = await Promise.all([
        getCampaign(pb, campaignId),
        getContacts(pb, campaignId),
        getFunnelStages(pb, campaignId),
        getContactStages(pb, campaignId),
        getBatches(pb, campaignId),
      ]);

      setCampaign(campaignData);
      setContacts(contactsData);
      setFunnelStages(stagesData.sort((a, b) => a.order - b.order));
      setBatches(batchesData);

      // Create contact -> stage mapping
      const stageMap = new Map<string, string>();
      contactStagesData.forEach((cs: ContactStage) => {
        stageMap.set(cs.contact, cs.stage);
      });
      setContactStageMap(stageMap);
    } catch (error) {
      console.error("Failed to load funnel data:", error);
      toast({
        title: "Error",
        description: "Failed to load funnel data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDragStart = (event: DragStartEvent) => {
    const contactId = event.active.id as string;
    const contact = contacts.find((c) => c.id === contactId);
    setActiveContact(contact || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveContact(null);
    const { active, over } = event;

    if (!over) return;

    const contactId = active.id as string;
    const overId = over.id as string;

    // Find which stage the contact was dropped on
    let targetStageId: string | null = null;

    // Check if dropped on a stage column
    const targetStage = funnelStages.find((s) => s.id === overId);
    if (targetStage) {
      targetStageId = targetStage.id;
    } else {
      // Check if dropped on another contact - use that contact's stage
      const overContact = contacts.find((c) => c.id === overId);
      if (overContact) {
        targetStageId = contactStageMap.get(overId) || null;
      }
    }

    if (!targetStageId) return;

    const currentStageId = contactStageMap.get(contactId);
    if (currentStageId === targetStageId) return;

    // Optimistically update UI
    const newStageMap = new Map(contactStageMap);
    newStageMap.set(contactId, targetStageId);
    setContactStageMap(newStageMap);

    // Update in database
    try {
      const pb = getClientPB();
      await setContactStage(pb, contactId, targetStageId);
    } catch (error) {
      console.error("Failed to update contact stage:", error);
      // Revert on error
      setContactStageMap(contactStageMap);
      toast({
        title: "Error",
        description: "Failed to move contact. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Apply batch filter to contacts
  const filteredContacts = batchFilter === "all" 
    ? contacts 
    : contacts.filter((c) => c.batch === batchFilter);

  const getContactsForStage = (stageId: string): Contact[] => {
    return filteredContacts.filter((c) => contactStageMap.get(c.id) === stageId);
  };

  const getUnassignedContacts = (): Contact[] => {
    return filteredContacts.filter((c) => !contactStageMap.has(c.id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Campaign not found</h2>
        <Button asChild className="mt-4">
          <Link href="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
    );
  }

  const unassignedContacts = getUnassignedContacts();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/campaigns/${campaignId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Sales Funnel</h1>
            <p className="text-muted-foreground">{campaign.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Batch Filter */}
          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="h-4 w-4 flex-shrink-0" />
                {batchFilter === "all" ? (
                  <span className="truncate">All Batches</span>
                ) : (
                  <span className="truncate">
                    {batches.find(b => b.id === batchFilter)?.name || "Filter by batch"}
                  </span>
                )}
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              {batches.map((batch) => (
                <SelectItem key={batch.id} value={batch.id}>
                  {batch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link href={`/campaigns/${campaignId}/settings`}>
              Manage Stages
            </Link>
          </Button>
        </div>
      </div>

      {funnelStages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center mb-4">
              No funnel stages configured. Set up your pipeline stages first.
            </p>
            <Button asChild>
              <Link href={`/campaigns/${campaignId}/settings`}>
                Configure Stages
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {/* Unassigned Column - only show if there are unassigned contacts */}
            {unassignedContacts.length > 0 && (
              <UnassignedColumn contacts={unassignedContacts} />
            )}

            {/* Stage Columns */}
            {funnelStages.map((stage, index) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                contacts={getContactsForStage(stage.id)}
                index={index}
              />
            ))}
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeContact ? (
              <div className="w-[280px]">
                <ContactCard contact={activeContact} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Stage Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {funnelStages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: stage.color || getStageColor(index) }}
                />
                <span className="text-sm">{stage.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {getContactsForStage(stage.id).length}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
