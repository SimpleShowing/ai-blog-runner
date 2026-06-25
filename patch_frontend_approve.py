with open('client/src/pages/PartnerSubmissions.tsx', 'r') as f:
    content = f.read()

# 1. Add new mutation hook right after the existing `approve` hook definition
old_hook_marker = '''  const approve = trpc.partnerSubmissions.approve.useMutation({'''

# Find the full approve hook block to insert after its closing
import re
match = re.search(r'const approve = trpc\.partnerSubmissions\.approve\.useMutation\(\{.*?\}\);\n', content, re.DOTALL)
if match:
    insertion_point = match.end()
    new_hook = '''  const approveAndPublish = trpc.partnerSubmissions.approveAndPublish.useMutation({
    onSuccess: () => {
      toast.success("Approved and published to WordPress!");
      utils.partnerSubmissions.list.invalidate();
      setSelected(null);
    },
    onError: (err) => {
      toast.error("Approve & Publish failed", { description: err.message });
    },
  });

'''
    content = content[:insertion_point] + new_hook + content[insertion_point:]
    print("✅ Added approveAndPublish mutation hook")
else:
    print("❌ Could not find approve hook block")

# 2. Swap table row button
old_row_button = '''                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => approve.mutate({ id: sub.id })}
                              disabled={approve.isPending}
                            >
                              Approve
                            </Button>'''
new_row_button = '''                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => approveAndPublish.mutate({ id: sub.id, origin: window.location.origin })}
                              disabled={approveAndPublish.isPending}
                            >
                              {approveAndPublish.isPending ? "Publishing..." : "Approve & Publish"}
                            </Button>'''
if old_row_button in content:
    content = content.replace(old_row_button, new_row_button, 1)
    print("✅ Swapped table row button")
else:
    print("❌ Could not find table row button")

# 3. Swap dialog footer button
old_dialog_button = '''                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => approve.mutate({ id: selected.id })}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    {approve.isPending ? "Approving..." : "Approve"}
                  </Button>'''
new_dialog_button = '''                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => approveAndPublish.mutate({ id: selected.id, origin: window.location.origin })}
                    disabled={approveAndPublish.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    {approveAndPublish.isPending ? "Publishing..." : "Approve & Publish"}
                  </Button>'''
if old_dialog_button in content:
    content = content.replace(old_dialog_button, new_dialog_button, 1)
    print("✅ Swapped dialog footer button")
else:
    print("❌ Could not find dialog footer button")

with open('client/src/pages/PartnerSubmissions.tsx', 'w') as f:
    f.write(content)
