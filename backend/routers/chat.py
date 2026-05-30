from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Optional
from datetime import datetime
import os
import uuid
import shutil

from database import get_db
from models.user import User
from models.task import Task
from models.chat_message import ChatMessage
from schemas.chat import ChatMessageCreate, ChatMessageOut, ChatUserOut
from routers.auth import get_current_user

router = APIRouter()

UPLOAD_DIR = os.path.join("static", "uploads", "chat")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/users", response_model=List[ChatUserOut])
def get_chat_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the list of users this user can privately message.
    - Admins can chat with everyone.
    - Non-admins can chat with all admins.
    - Non-admins can chat with users they share a task with (assigned <-> reviewer).
    """
    if current_user.role == "admin":
        users = db.query(User).filter(User.id != current_user.id, User.is_active == True).all()
        return users

    # Non-admins:
    # 1. All active admins
    admins = db.query(User).filter(User.role == "admin", User.is_active == True).all()
    
    # 2. Reviewers of tasks assigned to current_user
    reviewer_subquery = db.query(Task.reviewer_id).filter(
        Task.assigned_to == current_user.id,
        Task.reviewer_id.isnot(None)
    ).subquery()
    reviewers = db.query(User).filter(
        User.id.in_(reviewer_subquery),
        User.is_active == True
    ).all()
    
    # 3. Assignees of tasks reviewed by current_user
    assignee_subquery = db.query(Task.assigned_to).filter(
        Task.reviewer_id == current_user.id
    ).subquery()
    assignees = db.query(User).filter(
        User.id.in_(assignee_subquery),
        User.is_active == True
    ).all()
    
    # Combine lists and remove duplicates
    allowed_users = {}
    for u in (admins + reviewers + assignees):
        if u.id != current_user.id:
            allowed_users[u.id] = u
            
    return list(allowed_users.values())

@router.get("/messages", response_model=List[ChatMessageOut])
def get_chat_messages(
    recipient_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get chat messages.
    - If recipient_id is None: returns general group chat messages.
    - If recipient_id is provided: returns private messages between current_user and recipient_id.
    """
    if recipient_id is not None:
        # Check permissions
        is_allowed = False
        if current_user.role == "admin":
            is_allowed = True
        else:
            recipient = db.query(User).filter(User.id == recipient_id, User.is_active == True).first()
            if not recipient:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng nhận")
            if recipient.role == "admin":
                is_allowed = True
            else:
                connection_exists = db.query(Task).filter(
                    or_(
                        and_(Task.assigned_to == current_user.id, Task.reviewer_id == recipient_id),
                        and_(Task.reviewer_id == current_user.id, Task.assigned_to == recipient_id)
                    )
                ).first()
                if connection_exists:
                    is_allowed = True
                    
        if not is_allowed:
            raise HTTPException(status_code=403, detail="Không có quyền nhắn tin cho người dùng này")
            
        messages = db.query(ChatMessage).filter(
            or_(
                and_(ChatMessage.sender_id == current_user.id, ChatMessage.recipient_id == recipient_id),
                and_(ChatMessage.sender_id == recipient_id, ChatMessage.recipient_id == current_user.id)
            )
        ).order_by(ChatMessage.created_at.asc()).all()
        
    else:
        # General group messages
        messages = db.query(ChatMessage).filter(
            ChatMessage.recipient_id.is_(None)
        ).order_by(ChatMessage.created_at.asc()).all()

    res = []
    for msg in messages:
        # Filter out messages the current user cleared on their side (applies to admin's own view too)
        if msg.sender_id == current_user.id and msg.deleted_by_sender:
            continue
        if msg.recipient_id == current_user.id and msg.deleted_by_recipient:
            continue
        # Filter out general group messages created before user cleared the group chat
        if msg.recipient_id is None and current_user.general_chat_cleared_at is not None:
            if msg.created_at <= current_user.general_chat_cleared_at:
                continue

        sender_user = msg.sender
        recipient_user = msg.recipient
        
        is_del = msg.is_deleted
        msg_text = msg.message
        img_url = msg.image_url
        
        if is_del:
            if current_user.role == "admin":
                # Admin can see original content
                pass
            else:
                # Users see revocation notification
                msg_text = "Tin nhắn đã bị thu hồi"
                img_url = None
                
        res.append(ChatMessageOut(
            id=msg.id,
            sender_id=msg.sender_id,
            sender_username=sender_user.username if sender_user else "N/A",
            sender_full_name=sender_user.full_name if sender_user else None,
            sender_role=sender_user.role if sender_user else "user",
            sender_avatar_url=sender_user.avatar_url if sender_user else None,
            recipient_id=msg.recipient_id,
            recipient_username=recipient_user.username if recipient_user else None,
            message=msg_text,
            image_url=img_url,
            is_deleted=is_del,
            created_at=msg.created_at
        ))
    return res

@router.post("/messages", response_model=ChatMessageOut)
def send_chat_message(
    body: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a message (general or direct).
    """
    recipient_id = body.recipient_id
    if recipient_id is not None:
        # Check permissions
        is_allowed = False
        if current_user.role == "admin":
            is_allowed = True
        else:
            recipient = db.query(User).filter(User.id == recipient_id, User.is_active == True).first()
            if not recipient:
                raise HTTPException(status_code=404, detail="Không tìm thấy người dùng nhận")
            if recipient.role == "admin":
                is_allowed = True
            else:
                connection_exists = db.query(Task).filter(
                    or_(
                        and_(Task.assigned_to == current_user.id, Task.reviewer_id == recipient_id),
                        and_(Task.reviewer_id == current_user.id, Task.assigned_to == recipient_id)
                    )
                ).first()
                if connection_exists:
                    is_allowed = True
                    
        if not is_allowed:
            raise HTTPException(status_code=403, detail="Không có quyền nhắn tin cho người dùng này")
            
    if not body.message and not body.image_url:
        raise HTTPException(status_code=400, detail="Tin nhắn phải có nội dung hoặc hình ảnh")

    db_msg = ChatMessage(
        sender_id=current_user.id,
        recipient_id=recipient_id,
        message=body.message,
        image_url=body.image_url,
        is_deleted=False
    )
    db.add(db_msg)
    db.commit()
    db.refresh(db_msg)
    
    sender_user = db_msg.sender
    recipient_user = db_msg.recipient
    
    return ChatMessageOut(
        id=db_msg.id,
        sender_id=db_msg.sender_id,
        sender_username=sender_user.username if sender_user else "N/A",
        sender_full_name=sender_user.full_name if sender_user else None,
        sender_role=sender_user.role if sender_user else "user",
        sender_avatar_url=sender_user.avatar_url if sender_user else None,
        recipient_id=db_msg.recipient_id,
        recipient_username=recipient_user.username if recipient_user else None,
        message=db_msg.message,
        image_url=db_msg.image_url,
        is_deleted=False,
        created_at=db_msg.created_at
    )

@router.delete("/messages/{message_id}")
def delete_chat_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a chat message (soft delete).
    - Admins can delete any message.
    - Users can delete only their own messages.
    """
    msg = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Không tìm thấy tin nhắn")
        
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xóa tin nhắn này")
        
    msg.is_deleted = True
    db.commit()
    return {"detail": "Đã xóa tin nhắn thành công"}

@router.post("/upload-image")
def upload_chat_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload an image for chat messages.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Tập tin không phải là hình ảnh")
        
    ext = os.path.splitext(file.filename)[1]
    if not ext:
        ext = ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể lưu hình ảnh: {str(e)}")
        
    return {"url": f"/uploads/chat/{filename}"}

@router.delete("/conversations")
def delete_chat_conversation(
    recipient_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete the entire private or group conversation.
    - If recipient_id is None: Clears the general group chat for this user.
    - If recipient_id is provided: Clears the private chat conversation on the user's side.
    """
    if recipient_id is None:
        current_user.general_chat_cleared_at = datetime.now()
        db.commit()
        return {"detail": "Đã xóa cuộc trò chuyện nhóm chung thành công"}
        
    # Check recipient exists
    recipient = db.query(User).filter(User.id == recipient_id, User.is_active == True).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng nhận")
        
    # Messages sent by current_user
    db.query(ChatMessage).filter(
        ChatMessage.sender_id == current_user.id,
        ChatMessage.recipient_id == recipient_id
    ).update({ChatMessage.deleted_by_sender: True}, synchronize_session=False)
    
    # Messages received by current_user
    db.query(ChatMessage).filter(
        ChatMessage.sender_id == recipient_id,
        ChatMessage.recipient_id == current_user.id
    ).update({ChatMessage.deleted_by_recipient: True}, synchronize_session=False)
    
    db.commit()
    return {"detail": "Đã xóa cuộc trò chuyện thành công"}
