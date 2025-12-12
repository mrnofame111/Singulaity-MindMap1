                  {/* REDESIGNED LEFT PANEL - ATTACHMENTS */}
                  <div 
                    className="md:w-1/2 bg-gray-100 border-r border-gray-200 relative flex flex-col group/drop"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={async (e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            const files = Array.from(e.dataTransfer.files) as File[];
                            const newAttachments = await Promise.all(files.map(async f => {
                                const url = f.type.startsWith('image/') ? await compressImage(f) : await new Promise<string>(r => { const reader = new FileReader(); reader.onload = e => r(e.target?.result as string); reader.readAsDataURL(f); });
                                return {
                                    id: generateId(),
                                    type: f.type.startsWith('image/') ? 'image' : 'file',
                                    url,
                                    name: f.name,
                                    mimeType: f.type,
                                    size: f.size
                                } as Attachment;
                            }));
                            updateMemory(expandedMemory.id, { attachments: [...expandedMemory.attachments, ...newAttachments] });
                        }
                    }}
                  >