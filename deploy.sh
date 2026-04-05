#!/bin/bash
# 自動更新版本號並部署到 GitHub Pages
BUILD=$(date +%y%m%d%H%M)
sed -i "s/const BUILD = \"[^\"]*\"/const BUILD = \"${BUILD}\"/" index.html
echo "版本號: v${BUILD}"
git add -A
git commit -m "deploy v${BUILD}

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
echo "部署完成: v${BUILD}"
