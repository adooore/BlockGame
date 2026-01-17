Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# 深色背景（游戏风格）
$bgColor = [System.Drawing.Color]::FromArgb(15, 20, 30)
$g.Clear($bgColor)

# 角色参数（仿照 player.js 的绘制）
$blockSize = 320
$blockX = ($size - $blockSize) / 2
$blockY = ($size - $blockSize) / 2

# 颜色（来自 PLAYER_COLORS[1]）
$mainColor = [System.Drawing.Color]::FromArgb(0, 242, 255)      # #00f2ff 青色
$coreColor = [System.Drawing.Color]::FromArgb(224, 250, 255)    # #e0faff 白青色

# 绘制发光效果（模拟 shadowBlur）
for ($i = 40; $i -gt 0; $i -= 2) {
    $alpha = [int](20 * (40 - $i) / 40)
    $glowColor = [System.Drawing.Color]::FromArgb($alpha, $mainColor.R, $mainColor.G, $mainColor.B)
    $glowBrush = New-Object System.Drawing.SolidBrush($glowColor)
    $offset = $i
    $g.FillRectangle($glowBrush, $blockX - $offset, $blockY - $offset, $blockSize + $offset * 2, $blockSize + $offset * 2)
    $glowBrush.Dispose()
}

# 绘制主体方块（fillRect with mainColor）
$mainBrush = New-Object System.Drawing.SolidBrush($mainColor)
$g.FillRectangle($mainBrush, $blockX, $blockY, $blockSize, $blockSize)
$mainBrush.Dispose()

# 绘制内核（core，位于中心，25%边距，50%大小）
$coreOffset = $blockSize * 0.25
$coreSize = $blockSize * 0.5
$coreX = $blockX + $coreOffset
$coreY = $blockY + $coreOffset
$coreBrush = New-Object System.Drawing.SolidBrush($coreColor)
$g.FillRectangle($coreBrush, $coreX, $coreY, $coreSize, $coreSize)
$coreBrush.Dispose()

# 清理并保存
$g.Dispose()
$bmp.Save("C:\Users\MyCode\blockgame\scripts\app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Game Character Icon Generated!" -ForegroundColor Cyan
