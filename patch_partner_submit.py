with open('client/src/pages/PartnerSubmit.tsx', 'r') as f:
    content = f.read()

# 1. Remove old targetArticleUrl block from Submission Type card
old_target = '''
              {submissionType === "link_insertion" && (
                <div className="space-y-1.5">
                  <Label htmlFor="targetArticleUrl">Target SimpleShowing Article URL <span className="text-red-500">*</span></Label>
                  <Input
                    id="targetArticleUrl"
                    placeholder="https://www.simpleshowing.com/blog/..."
                    {...register("targetArticleUrl", {
                      required: submissionType === "link_insertion" ? "Target article URL is required" : false,
                    })}
                  />
                  {errors.targetArticleUrl && <p className="text-xs text-red-500">{errors.targetArticleUrl.message}</p>}
                </div>
              )}'''

if old_target in content:
    content = content.replace(old_target, '')
    print("✅ Removed old targetArticleUrl block")
else:
    print("❌ Could not find old targetArticleUrl block")

# 2. Wrap Article Details card with guest_post condition
old_article_open = '          {/* Article Details */}\n          <Card className="shadow-sm">'
new_article_open = '          {/* Article Details — guest post only */}\n          {submissionType === "guest_post" && <Card className="shadow-sm">'
if old_article_open in content:
    content = content.replace(old_article_open, new_article_open)
    print("✅ Wrapped Article Details opening")
else:
    print("❌ Could not find Article Details opening")

old_article_close = '          </Card>\n\n          {/* Declared Links */}'
new_article_close = '          </Card>}\n\n          {/* Links */}'
if old_article_close in content:
    content = content.replace(old_article_close, new_article_close)
    print("✅ Wrapped Article Details closing")
else:
    print("❌ Could not find Article Details closing")

# 3. Replace Declared Links card
old_declared = '          <Card className="shadow-sm">\n            <CardHeader className="pb-3">\n              <CardTitle className="text-base flex items-center gap-2">\n                <Link2 className="h-4 w-4" />\n                Declare All Links'

new_declared = '''          {submissionType === "guest_post" ? (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Declare All Links'''

if old_declared in content:
    content = content.replace(old_declared, new_declared, 1)
    print("✅ Replaced Declared Links opening")
else:
    print("❌ Could not find Declared Links opening")

old_declared_close = '''              </CardContent>
            </Card>

          {/* Submit */}'''

new_declared_close = '''              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Link Placement Details
                </CardTitle>
                <CardDescription>
                  Tell us where you want the link placed and what it should say.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="targetArticleUrl">Target SimpleShowing Article URL <span className="text-red-500">*</span></Label>
                  <Input
                    id="targetArticleUrl"
                    placeholder="https://simpleshowing.com/blog/your-article"
                    {...register("targetArticleUrl", {
                      required: "Target article URL is required",
                    })}
                  />
                  {errors.targetArticleUrl && <p className="text-xs text-red-500">{errors.targetArticleUrl.message}</p>}
                  <p className="text-xs text-slate-400">The existing SimpleShowing blog post where you want your link inserted.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientLinkUrl">Your Link URL <span className="text-red-500">*</span></Label>
                  <Input
                    id="clientLinkUrl"
                    placeholder="https://yourclientsite.com/page"
                    {...register("declaredLinks.0.url", {
                      required: "Client URL is required",
                    })}
                  />
                  {errors.declaredLinks?.[0]?.url && <p className="text-xs text-red-500">{errors.declaredLinks[0]?.url?.message}</p>}
                  <p className="text-xs text-slate-400">The do-follow link you want inserted into the article.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientAnchorText">Desired Anchor Text <span className="text-red-500">*</span></Label>
                  <Input
                    id="clientAnchorText"
                    placeholder="e.g. best HVAC installation services"
                    {...register("declaredLinks.0.anchorText", { required: "Anchor text is required" })}
                  />
                  {errors.declaredLinks?.[0]?.anchorText && <p className="text-xs text-red-500">{errors.declaredLinks[0]?.anchorText?.message}</p>}
                  <p className="text-xs text-slate-400">The clickable text for your link.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit */}'''

if old_declared_close in content:
    content = content.replace(old_declared_close, new_declared_close, 1)
    print("✅ Added Link Placement Details card")
else:
    print("❌ Could not find Declared Links closing")

with open('client/src/pages/PartnerSubmit.tsx', 'w') as f:
    f.write(content)

print("✅ File written")
