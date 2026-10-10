# Release a new version

Releases are built by GitHub Actions and uploaded to a **draft** GitHub Release, which you then publish by hand.

You need push access to the repository.

## Steps

1. Bump `version` in `package.json`, for example to `0.2.5`. Run `npm install` so `package-lock.json` picks up the new version.
2. Commit and push to `main`:

   ```
   git commit -am "Release 0.2.5"
   git push
   ```

3. Tag the commit with the **same** version, prefixed with `v`, and push the tag:

   ```
   git tag v0.2.5
   git push origin v0.2.5
   ```

4. Open the repository's **Actions** tab and wait for the **Release** workflow to finish. It builds Windows, macOS and Linux in parallel.
5. Open **Releases**. A draft named after the version holds every installer.
6. Check that all expected files are there (see [Build configuration](../reference/build-configuration.md#release-files)), write the release notes, and click **Publish release**.

The README links to `releases/latest`, so download links update as soon as the release is published.

## If something goes wrong

- **The tag and `package.json` disagree.** electron-builder names and uploads files using the `package.json` version, not the tag. Delete the tag (`git push --delete origin v0.2.5` and `git tag -d v0.2.5`), fix the version, and tag again.
- **One platform failed.** Each platform is a separate job and the others carry on. Fix the problem and re-run the failed job from the Actions page; it uploads to the same draft.
- **You need to rebuild without a new tag.** The Release workflow can also be started by hand from the Actions tab (*Run workflow*).
