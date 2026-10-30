/** Localized tutorial navigation. The authored article body keeps its original language. */
export const tutorialMessages:Record<string,readonly [string,string]> = {
  "片元、像素与第一个颜色": [
    "Fragments, pixels and your first color",
    "フラグメントと最初の色"
  ],
  "理解 mainImage 如何把一个像素坐标映射到颜色。": [
    "Map pixel coordinates to a color with mainImage.",
    "mainImage で画素座標を色に変換します。"
  ],
  "UV、中心坐标与宽高比": [
    "UVs, centered coordinates and aspect ratio",
    "UV・中心座標・アスペクト比"
  ],
  "在任意尺寸画布上得到形状不变的坐标。": [
    "Keep shapes consistent at any canvas size.",
    "画面サイズによらず同じ形を保つ座標を作ります。"
  ],
  "颜色、插值与分层": [
    "Color, interpolation and layers",
    "色・補間・レイヤー"
  ],
  "用遮罩决定两种颜色怎样交接。": [
    "Blend two colors using a mask.",
    "マスクで2つの色の混ざり方を決めます。"
  ],
  "step、smoothstep 与抗锯齿": [
    "step, smoothstep and antialiasing",
    "step・smoothstep・アンチエイリアス"
  ],
  "把硬阈值变成稳定的像素覆盖率。": [
    "Turn hard thresholds into stable pixel coverage.",
    "硬い境界を安定した画素の被覆率に変換します。"
  ],
  "圆的解析式：从等式到填充": [
    "The circle equation: outline to fill",
    "円の式から輪郭と塗りへ"
  ],
  "用圆方程画轮廓、圆盘和圆环。": [
    "Draw outlines, discs and rings with the circle equation.",
    "円の方程式で輪郭、円盤、リングを描きます。"
  ],
  "椭圆解析式与距离近似": [
    "Ellipses and distance approximation",
    "楕円と距離の近似"
  ],
  "区分内外判定、局部距离近似和精确最近距离。": [
    "Distinguish inside tests, local approximations and exact distances.",
    "内外判定、局所近似、正確な最短距離を区別します。"
  ],
  "直线、线段与胶囊": [
    "Lines, segments and capsules",
    "直線・線分・カプセル"
  ],
  "用最近点投影画可旋转的线条。": [
    "Draw rotated lines using nearest-point projection.",
    "最近点への射影で回転できる線を描きます。"
  ],
  "极坐标、弧线与参数曲线": [
    "Polar coordinates, arcs and parametric curves",
    "極座標・円弧・パラメトリック曲線"
  ],
  "把角度、半径和参数当成绘图工具。": [
    "Use angles, radii and parameters to draw.",
    "角度、半径、パラメーターを描画に使います。"
  ],
  "有符号距离场：画出看不见的数": [
    "Signed distance fields: visualizing numbers",
    "符号付き距離場を可視化する"
  ],
  "用正负号和等距线理解 SDF。": [
    "Understand SDFs through signs and equal-distance contours.",
    "正負の符号と等距離線から SDF を理解します。"
  ],
  "圆的距离：径向最近点": [
    "Circle distance and radial nearest points",
    "円の距離と半径方向の最近点"
  ],
  "从查询点沿半径方向找到圆上的最近点。": [
    "Find the nearest point on a circle along the radius.",
    "半径方向に円上の最近点を求めます。"
  ],
  "半平面：投影就是有符号距离": [
    "Half-planes: projection as signed distance",
    "半平面と射影による符号付き距離"
  ],
  "用单位法线和点积推导直线两侧的距离。": [
    "Derive distances on both sides of a line using a unit normal and dot product.",
    "単位法線と内積で直線の両側の距離を導きます。"
  ],
  "矩形距离：内部、边外与角外": [
    "Box distance: inside, edges and corners",
    "長方形の距離：内側・辺・角"
  ],
  "搭建自己的二维距离函数工具箱。": [
    "Build your own 2D distance-function toolbox.",
    "2D 距離関数のツールボックスを作ります。"
  ],
  "圆角矩形：内缩骨架再膨胀": [
    "Rounded boxes: inset and expand",
    "角丸長方形：内縮と膨張"
  ],
  "在保持外轮廓尺寸不变的前提下构建圆角。": [
    "Round corners without changing the outer dimensions.",
    "外形の大きさを保ったまま角を丸くします。"
  ],
  "胶囊：从线段膨胀出厚度": [
    "Capsules: adding thickness to a segment",
    "カプセル：線分に厚みを付ける"
  ],
  "把最近线段距离变成有内部的实心图元。": [
    "Turn segment distance into a solid shape with an interior.",
    "線分への距離から内部を持つ図形を作ります。"
  ],
  "三角形：边距离与内部判定分开": [
    "Triangles: edge distance and inside tests",
    "三角形：辺の距離と内外判定"
  ],
  "理解为什么最小线段距离还需要额外添加符号。": [
    "Understand why minimum segment distance also needs a sign.",
    "最短の辺距離に符号が必要な理由を学びます。"
  ],
  "正多边形：把三条边推广到 N 条": [
    "Regular polygons: from three sides to N",
    "正多角形：3辺から N 辺へ"
  ],
  "把三角形算法参数化为可重复使用的图元。": [
    "Generalize the triangle algorithm into a reusable primitive.",
    "三角形の手順を再利用できる図形に一般化します。"
  ],
  "凹多边形与星形：奇偶交点规则": [
    "Concave polygons, stars and the even–odd rule",
    "凹多角形・星形・偶奇規則"
  ],
  "替换只适用于凸多边形的内部测试。": [
    "Replace inside tests that only work for convex polygons.",
    "凸多角形だけに使える内外判定を拡張します。"
  ],
  "椭圆距离：最近点为何不在径向上": [
    "Ellipse distance: beyond radial nearest points",
    "楕円の距離：半径方向ではない最近点"
  ],
  "从正确轮廓进一步获得更接近等宽的距离。": [
    "Improve distance accuracy for more even outlines.",
    "輪郭の幅をそろえるために距離の精度を高めます。"
  ],
  "圆弧：限制角度并补上圆头端点": [
    "Arc distance: angle limits and round ends",
    "円弧の距離：角度制限と丸い端点"
  ],
  "把完整圆周的最近点限制在一个角度区间内。": [
    "Limit the nearest point on a circle to an angular interval.",
    "円上の最近点を指定した角度区間に制限します。"
  ],
  "平移、旋转、缩放与重复": [
    "Translation, rotation, scaling and repetition",
    "平行移動・回転・拡縮・繰り返し"
  ],
  "通过变换采样坐标移动形状。": [
    "Move shapes by transforming sampling coordinates.",
    "サンプリング座標を変換して図形を動かします。"
  ],
  "布尔并集：从符号逻辑得到 min": [
    "Union: deriving min from sign logic",
    "和集合：符号の論理から min へ"
  ],
  "把多个简单 SDF 组合成可读的复杂轮廓。": [
    "Combine simple SDFs into readable complex outlines.",
    "単純な SDF を組み合わせて複雑な輪郭を作ります。"
  ],
  "交集：保留同时在内部的区域": [
    "Intersection: keeping the shared interior",
    "共通部分：両方の内側を残す"
  ],
  "在同一对图形上把 min 改为 max，并检查符号。": [
    "Replace min with max and verify the signs.",
    "同じ2つの図形で min を max に変えて符号を確かめます。"
  ],
  "差集：翻转被减图形的符号": [
    "Difference: negating the subtracted shape",
    "差集合：引く図形の符号を反転"
  ],
  "把 A 内、B 外两个条件写成一个场。": [
    "Express inside A and outside B as one field.",
    "A の内側かつ B の外側という条件を1つの場にします。"
  ],
  "平滑并集、描边与形态变化": [
    "Smooth unions, outlines and shape changes",
    "滑らかな和集合・輪郭線・形状変化"
  ],
  "让几何接缝变柔和，同时控制形状厚度。": [
    "Soften joins while controlling thickness.",
    "接合部を滑らかにしながら図形の厚みを制御します。"
  ],
  "网格、镜像与极坐标重复": [
    "Grids, mirrors and polar repetition",
    "グリッド・鏡映・極座標での繰り返し"
  ],
  "用一个小图元覆盖更大的空间。": [
    "Cover a large space with one small primitive.",
    "小さな図形を繰り返して広い空間を埋めます。"
  ],
  "随机值与噪声：从可复现哈希开始": [
    "Random values and reproducible hashes",
    "乱数と再現可能なハッシュ"
  ],
  "先区分无关联的随机格子和连续噪声，再理解种子如何控制结果。": [
    "Distinguish random cells from continuous noise and understand seeds.",
    "独立した乱数と連続ノイズを区別し、シードを理解します。"
  ],
  "1D 噪声Ⅰ：两个端点与线性插值": [
    "1D noise I: endpoints and linear interpolation",
    "1D ノイズⅠ：端点と線形補間"
  ],
  "在一条轴上连接随机格点，获得连续但有折角的噪声曲线。": [
    "Connect random grid points into a continuous curve with corners.",
    "乱数の格子点をつなぎ、折れ曲がりのある連続曲線を作ります。"
  ],
  "1D 噪声Ⅱ：平滑权重与连续斜率": [
    "1D noise II: smooth weights and slopes",
    "1D ノイズⅡ：滑らかな重みと傾き"
  ],
  "保留格点值，用平滑插值消除线性噪声的折角。": [
    "Preserve grid values and remove corners using smooth interpolation.",
    "格子点の値を保ち、滑らかな補間で角をなくします。"
  ],
  "2D 噪声：四个角点与双线性插值": [
    "2D noise: four corners and bilinear interpolation",
    "2D ノイズ：4頂点と双線形補間"
  ],
  "把一维的两端插值推广到二维四角，生成连续灰度纹理。": [
    "Extend endpoint interpolation to four corners for continuous textures.",
    "2端点の補間を4頂点に拡張し、連続したテクスチャを作ります。"
  ],
  "2D fBM：大轮廓与细节分层": [
    "2D fBM: broad shapes and fine detail",
    "2D fBM：大きな形と細部"
  ],
  "叠加多层二维噪声，分别控制频率、振幅和细节层数。": [
    "Layer 2D noise while controlling frequency, amplitude and octaves.",
    "周波数、振幅、層の数を制御して2D ノイズを重ねます。"
  ],
  "2D 高度图：海岸、山地与等高线": [
    "2D height maps: coasts, mountains and contours",
    "2D 高さマップ：海岸・山・等高線"
  ],
  "将二维噪声解释为地表高度，为体素地形准备同一个高度函数。": [
    "Interpret noise as terrain height for later voxel landscapes.",
    "2D ノイズを地形の高さとして扱い、ボクセル地形に備えます。"
  ],
  "3D 噪声：八个角点与移动切片": [
    "3D noise: eight corners and moving slices",
    "3D ノイズ：8頂点と移動する断面"
  ],
  "把二维四角插值推广到三维八角，观察体数据内部的连续变化。": [
    "Extend four-corner interpolation to eight corners in a continuous volume.",
    "4頂点から8頂点への補間を拡張し、体積内部の連続変化を見ます。"
  ],
  "3D fBM：空间中的粗细结构": [
    "3D fBM: coarse and fine spatial structure",
    "3D fBM：空間の大きな構造と細部"
  ],
  "把多尺度叠加推广到三维，为密度场、岩石和洞穴细节建立基础。": [
    "Build a foundation for density, rocks and caves with multiscale noise.",
    "3D の多層ノイズで密度場、岩、洞窟の基礎を作ります。"
  ],
  "域变形与二维特效练习": [
    "Domain warping and 2D effects",
    "ドメインワープと2D エフェクト"
  ],
  "扭曲坐标，制作流动的大理石与能量纹路。": [
    "Distort coordinates to create flowing marble and energy patterns.",
    "座標をゆがめて流れる大理石やエネルギー模様を作ります。"
  ],
  "相机与三维射线": [
    "Cameras and 3D rays",
    "カメラと3D レイ"
  ],
  "让每个屏幕像素对应一条世界空间中的射线。": [
    "Assign a world-space ray to every screen pixel.",
    "画面の各画素にワールド空間のレイを対応させます。"
  ],
  "3D 距离场：先观察空间切片": [
    "3D distance fields: inspecting slices",
    "3D 距離場：断面を観察する"
  ],
  "把二维距离场工具迁移到三维空间。": [
    "Transfer 2D distance-field tools into 3D.",
    "2D の距離場の道具を3D 空間に広げます。"
  ],
  "Ray Marching 与 Sphere Tracing": [
    "Ray marching and sphere tracing",
    "レイマーチングとスフィアトレーシング"
  ],
  "沿射线寻找第一个可靠的表面交点。": [
    "Find the first reliable surface intersection along a ray.",
    "レイに沿って最初の確かな表面の交点を探します。"
  ],
  "球体距离：增加地面与第二个球": [
    "Sphere distance: a floor and a second sphere",
    "球の距離：地面と2つ目の球"
  ],
  "将二维圆的径向推导原样拓展到三维。": [
    "Extend the radial derivation for circles into three dimensions.",
    "2D の円の距離を3D の球に拡張します。"
  ],
  "盒子距离：面、棱与角的统一公式": [
    "Box distance: faces, edges and corners",
    "箱の距離：面・辺・角の統一"
  ],
  "把二维矩形的内外分支推广到三维。": [
    "Generalize inside and outside cases from rectangles to boxes.",
    "2D 長方形の内外の分岐を3D の箱に拡張します。"
  ],
  "圆环距离：先降维，再求小圆距离": [
    "Torus distance: reduce dimensions first",
    "トーラスの距離：次元を減らす"
  ],
  "把到三维圆环的距离转成二维问题。": [
    "Reduce the 3D torus-distance problem to a 2D circle.",
    "3D トーラスの距離を2D の円の問題に変換します。"
  ],
  "有限圆柱：圆盘与高度区间的乘积": [
    "Capped cylinders: a disc and a height interval",
    "有限円柱：円盤と高さ区間"
  ],
  "同时处理侧面、端盖和端盖外缘。": [
    "Handle the side, caps and outer cap edges together.",
    "側面、端面、端面の外周を同時に扱います。"
  ],
  "拉伸：让二维多边形获得厚度": [
    "Extrusion: giving 2D polygons depth",
    "押し出し：2D 多角形に厚みを付ける"
  ],
  "把已经实现的二维 SDF 作为三维造型模块复用。": [
    "Reuse an existing 2D SDF as a 3D modeling module.",
    "作成済みの2D SDF を3D の造形部品として使います。"
  ],
  "梯度、法线与命中调试": [
    "Gradients, normals and hit debugging",
    "勾配・法線・交点のデバッグ"
  ],
  "让不可见的空间计算变成可检查的颜色。": [
    "Turn invisible spatial calculations into inspectable colors.",
    "見えない空間の計算を色にして確認します。"
  ],
  "体积渲染Ⅰ：半透明球与路径厚度": [
    "Volume rendering I: translucent spheres",
    "ボリューム描画Ⅰ：半透明の球"
  ],
  "让球的边缘透出背景、中心更浓，理解透明度来自介质中的路径长度。": [
    "Relate opacity to path length through the medium.",
    "背景が透ける球から、透明度と媒質内の経路長の関係を学びます。"
  ],
  "体积渲染Ⅱ：半透明立方体与 Slab 求交": [
    "Volume rendering II: boxes and slab intersections",
    "ボリューム描画Ⅱ：箱と Slab 交差"
  ],
  "用三个坐标轴的交区间求立方体厚度，观察视角如何改变透光。": [
    "Find thickness from three axis intervals and observe view-dependent transmission.",
    "3軸の交差区間から厚みを求め、視点による透過の変化を見ます。"
  ],
  "体积渲染Ⅲ：逐段采样与密度累积": [
    "Volume rendering III: sampling and density accumulation",
    "ボリューム描画Ⅲ：サンプリングと密度累積"
  ],
  "在体积内部步进，合成非均匀密度，并避免透明度随步数变化。": [
    "Integrate nonuniform density without making opacity depend on step count.",
    "不均一な密度を積算し、ステップ数で透明度が変わる問題を防ぎます。"
  ],
  "体素地形Ⅰ：把高度图堆成方块": [
    "Voxel terrain I: stacking a height map",
    "ボクセル地形Ⅰ：高さマップを積む"
  ],
  "把 H(x,z) 变为真实立体方块地形，并用逐格射线遍历找到可见表面。": [
    "Turn H(x,z) into blocks and traverse cells to find visible surfaces.",
    "H(x,z) を立体ブロックにし、セルをたどって表面を探します。"
  ],
  "体素地形Ⅱ：3D 噪声洞穴与悬挑": [
    "Voxel terrain II: 3D noise caves and overhangs",
    "ボクセル地形Ⅱ：洞窟と張り出し"
  ],
  "给地形内部增加三维密度判定，生成洞穴、天然桥和悬挑结构。": [
    "Use 3D density to carve caves, natural bridges and overhangs.",
    "3D の密度判定で洞窟、天然の橋、張り出しを作ります。"
  ],
  "漫反射、高光与材质分层": [
    "Diffuse light, highlights and material layers",
    "拡散反射・ハイライト・マテリアル"
  ],
  "让法线与光照方向共同解释形体。": [
    "Use normals and lighting directions to reveal shape.",
    "法線と光の方向で立体の形を表現します。"
  ],
  "硬阴影与软阴影近似": [
    "Hard shadows and soft-shadow approximations",
    "硬い影と柔らかい影の近似"
  ],
  "从表面再向光源走一次。": [
    "March again from the surface toward the light.",
    "表面から光源へ向かってもう一度進みます。"
  ],
  "环境遮蔽与空间层次": [
    "Ambient occlusion and spatial depth",
    "アンビエントオクルージョンと奥行き"
  ],
  "用局部遮挡强调凹槽与接触。": [
    "Emphasize creases and contacts with local occlusion.",
    "局所的な遮蔽でくぼみや接触部分を強調します。"
  ],
  "反射、Fresnel 与 Cubemap": [
    "Reflection, Fresnel and cubemaps",
    "反射・フレネル・キューブマップ"
  ],
  "让观察方向影响表面的反光程度。": [
    "Make reflection strength depend on the viewing direction.",
    "見る方向に応じて表面の反射の強さを変えます。"
  ],
  "时间、节奏与可控运动": [
    "Time, rhythm and controllable motion",
    "時間・リズム・制御できる動き"
  ],
  "把动画写成可重置、可推导的函数。": [
    "Write animation as predictable, resettable functions.",
    "予測できてリセットできる関数でアニメーションを書きます。"
  ],
  "图片、视频与采样坐标": [
    "Images, video and sampling coordinates",
    "画像・動画・サンプリング座標"
  ],
  "让素材输入成为计算的一部分。": [
    "Make asset inputs part of your calculations.",
    "入力素材を計算の一部として使います。"
  ],
  "鼠标位置：从像素到图形坐标": [
    "Mouse position: pixels to drawing coordinates",
    "マウス位置：画素から描画座標へ"
  ],
  "把鼠标位置转换到画图坐标，让圆形图片窗口跟随拖动。": [
    "Convert the pointer position and drag a circular image window.",
    "ポインター位置を描画座標に変換し、円形の画像窓を動かします。"
  ],
  "点击与拖动：起点、当前位置和释放": [
    "Click and drag: start, position and release",
    "クリックとドラッグ：始点・現在地・解放"
  ],
  "读取 iMouse.zw 保存的点击起点，画出拖动向量。": [
    "Read the click origin in iMouse.zw and draw the drag vector.",
    "iMouse.zw の押下位置を読み、ドラッグのベクトルを描きます。"
  ],
  "键盘纹理：按住状态与方向控制": [
    "Keyboard textures: held keys and direction",
    "キーボードテクスチャ：長押しと方向入力"
  ],
  "学会绑定键盘、采样键值，并把方向键组合成二维输入。": [
    "Bind a keyboard and combine arrow keys into 2D input.",
    "キーボードを割り当て、矢印キーを2D 入力に組み合わせます。"
  ],
  "单次按下与切换：三个状态各司其职": [
    "Pressed and toggled keys: three distinct states",
    "押下と切り替え：3つの状態"
  ],
  "区分持续按住、单帧事件和跨帧开关，避免一按就反复切换。": [
    "Distinguish holds, single-frame events and persistent toggles.",
    "長押し、1フレームのイベント、持続する切り替えを区別します。"
  ],
  "持续移动：用 Buffer 保存交互状态": [
    "Continuous movement: storing state in a Buffer",
    "連続移動：Buffer に状態を保存"
  ],
  "用上一帧位置与时间步长积分，实现松手停留、斜向等速和单次重置。": [
    "Integrate position over time with equal diagonal speed and single resets.",
    "前フレームの位置と時間刻みで移動し、斜めの速度とリセットを制御します。"
  ],
  "键盘字形：把按键映射到 MSDF": [
    "Keyboard glyphs: mapping keys to MSDF",
    "キーボードの文字：MSDF に対応させる"
  ],
  "用输入改变图形，而不是只改变颜色。": [
    "Let input change the shape instead of only its color.",
    "入力で色だけでなく形も変えます。"
  ],
  "Buffer、历史帧与反馈": [
    "Buffers, frame history and feedback",
    "Buffer・履歴フレーム・フィードバック"
  ],
  "让画面拥有记忆。": [
    "Give your image a memory.",
    "画面に記憶を持たせます。"
  ],
  "距离雾与透射率": [
    "Distance fog and transmittance",
    "距離による霧と透過率"
  ],
  "区分表面着色与沿路径积累。": [
    "Distinguish surface shading from accumulation along a path.",
    "表面のシェーディングと経路に沿った累積を区別します。"
  ],
  "自发光与色调映射": [
    "Emission and tone mapping",
    "自己発光とトーンマッピング"
  ],
  "在亮部细节和视觉冲击之间取得平衡。": [
    "Balance bright details and visual impact.",
    "明るい部分の細部と視覚的な強さを両立させます。"
  ],
  "程序化场景：从零件到画面": [
    "Procedural scenes: parts to a complete image",
    "プロシージャルなシーン：部品から画面へ"
  ],
  "用一个小场景串联建模、光照与构图。": [
    "Combine modeling, lighting and composition in a small scene.",
    "小さなシーンでモデリング、照明、構図を組み合わせます。"
  ],
  "调试、性能与毕业作品": [
    "Debugging, performance and your final project",
    "デバッグ・性能・最終作品"
  ],
  "用可验证的步骤完成一件可分享的效果。": [
    "Complete a shareable effect using verifiable steps.",
    "確認できる手順で共有できるエフェクトを完成させます。"
  ]
};
