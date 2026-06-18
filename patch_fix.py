with open('client/src/pages/PartnerSubmit.tsx', 'r') as f:
    content = f.read()

old = '''            </CardContent>
          </Card>

          {/* Submit */}'''

new = '''            </CardContent>
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

if old in content:
    content = content.replace(old, new, 1)
    print("✅ Link Placement Details card inserted")
else:
    print("❌ Still could not find closing block")

with open('client/src/pages/PartnerSubmit.tsx', 'w') as f:
    f.write(content)
print("✅ File written")
