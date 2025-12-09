# 3D model generate sequence:

1. create model from https://readyplayer.me/

2. download with ARKit & Oculus Visemes: https://modeldownload_link?morphTargets=ARKit,Oculus Visemes

3. Convert to FBX using blender
    - create new Generic, delete all object
    - import GLB
    - Export with Forward: Y Forward

4. Create animation in Mixamo,
    - import model FBX
    - Idle
    - Talking_0
    - Talking_1
    - Talking_2
    - Terrified
    - Dancing
    - export each as FBX, without skin

5. Merge animations in blender
    - new general, delete all existing objects  
    - import FBXs
    - show Dope Sheet - Action Editor
    - name it ; Idle, Talking_0, Talking_1, ...
    - import more FBX animation
    - Delete hierarchy on new armature
    - select first armature
    - show Dope Sheet - Action Editor
    - select animation name, rename to Talking_0, Talking_1, etc ...
    - Push down each
    - check on Non Linear Animation
    - repeat for Talking_2, Rumba, etc...
    - Export animations to GLB, 
    - Data Compression: True, Transform: not Y-Up parameter
    - save to male.glb or female.glb on animations/ folder

6. Model & Animation GLB ready to be imported from the apps

7. Optinal, create AvatarX.jsx
    - npx ... - o src/components/AvatarX.jsx